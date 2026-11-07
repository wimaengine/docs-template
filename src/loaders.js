import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { Application, ReflectionKind } from "typedoc";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { projectRootDir } from "./config/project.js";
import { getApiSourceDir, getExamplesContentDir, getGuideContentDir, getIntroContentPath } from "./config/site.js";

const examplesRoot = getExamplesContentDir();
const guideRoot = getGuideContentDir();
const apiRoot = getApiSourceDir();
const introRoot = getIntroContentPath();
const apiSourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const supportedApiKinds = new Set([
  ReflectionKind.Class,
  ReflectionKind.Enum,
  ReflectionKind.Function,
  ReflectionKind.Variable,
  ReflectionKind.Interface,
  ReflectionKind.TypeAlias
]);

function toDisplayPath(filePath) {
  const relativePath = path.relative(projectRootDir, filePath).split(path.sep).join("/");
  return relativePath.startsWith("..") ? relativePath : `/${relativePath}`;
}

function toTitle(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

async function collectExampleFiles(dir, root) {
  const dirEntries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const dirEntry of dirEntries) {
    const fullPath = path.join(dir, dirEntry.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");

    if (dirEntry.isDirectory()) {
      if (relativePath === "addons" || relativePath.startsWith("addons/")) {
        continue;
      }
      files.push(...(await collectExampleFiles(fullPath, root)));
      continue;
    }

    if (dirEntry.isFile() && dirEntry.name.endsWith(".js")) {
      files.push(path.relative(root, fullPath));
    }
  }

  return files;
}

// Manual directory scans need explicit watcher wiring. Built-in loaders like
// `glob()` auto-watch, but these JS examples are loaded as raw source strings.
async function syncExampleEntries({ examplesRoot, parseData, store, meta, generateDigest }) {
  const relativePaths = (await collectExampleFiles(examplesRoot, examplesRoot)).sort((a, b) => a.localeCompare(b));
  const entries = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const normalizedPath = relativePath.split(path.sep).join("/");
      const id = normalizedPath.replace(/\.js$/, "");
      const segments = id.split("/");
      const category = segments[0] || "uncategorized";
      const fileName = segments.at(-1) || "example";
      const absoluteFilePath = path.join(examplesRoot, relativePath);
      const storedFilePath = path.relative(projectRootDir, absoluteFilePath).split(path.sep).join("/");

      let source;
      try {
        source = await readFile(absoluteFilePath, "utf-8");
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return null;
        }

        throw error;
      }

      return {
        id,
        filePath: storedFilePath,
        data: {
          title: toTitle(fileName),
          description: `${toTitle(category)} example`,
          category,
          filePath: toDisplayPath(absoluteFilePath),
          source
        }
      };
    })
  );

  const validEntries = entries.filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
  const digest = generateDigest(validEntries);
  const previousDigest = meta.get("examples-digest");

  if (previousDigest === digest) {
    return false;
  }

  const parsedEntries = await Promise.all(
    validEntries.map(async (entry) => ({
      id: entry.id,
      filePath: entry.filePath,
      data: await parseData({
        id: entry.id,
        data: entry.data,
        filePath: path.resolve(projectRootDir, entry.filePath)
      })
    }))
  );

  store.clear();

  for (const entry of parsedEntries) {
    store.set({
      id: entry.id,
      data: entry.data,
      filePath: entry.filePath
    });
  }

  meta.set("examples-digest", digest);
  return true;
}

function isApiSourceFile(fileName) {
  return apiSourceExtensions.has(path.extname(fileName).toLowerCase());
}

async function collectSourceFiles(dir, root) {
  const dirEntries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const dirEntry of dirEntries) {
    const fullPath = path.join(dir, dirEntry.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");

    if (dirEntry.isDirectory()) {
      if (dirEntry.name === "node_modules" || dirEntry.name === "dist" || dirEntry.name === "build") {
        continue;
      }

      files.push(...(await collectSourceFiles(fullPath, root)));
      continue;
    }

    if (!dirEntry.isFile() || !isApiSourceFile(dirEntry.name)) {
      continue;
    }

    if (dirEntry.name.startsWith("content.config.")) {
      continue;
    }

    files.push(path.relative(root, fullPath));
  }

  return files;
}

function isSupportedReflection(reflection) {
  return supportedApiKinds.has(reflection.kind);
}

function collectTopLevelReflections(reflections, output = []) {
  for (const reflection of reflections ?? []) {
    if (isSupportedReflection(reflection)) {
      output.push(reflection);
      continue;
    }

    if (reflection.kind === ReflectionKind.Module || reflection.kind === ReflectionKind.Namespace) {
      collectTopLevelReflections(reflection.children, output);
    }
  }

  return output;
}

function resolveReflectionSourcePath(reflection, sourceFiles) {
  const source = reflection.sources?.find((item) => typeof item.fileName === "string");

  if (!source) {
    return null;
  }

  const sourceName = source.fileName.split(path.sep).join("/");
  const normalizedAbsoluteName = path.isAbsolute(sourceName) ? path.normalize(sourceName) : null;

  for (const filePath of sourceFiles) {
    const relativeToApi = path.relative(apiRoot, filePath).split(path.sep).join("/");
    const relativeToProject = path.relative(projectRootDir, filePath).split(path.sep).join("/");

    if (
      (normalizedAbsoluteName && path.normalize(filePath) === normalizedAbsoluteName) ||
      relativeToApi === sourceName ||
      relativeToProject === sourceName ||
      relativeToApi.endsWith("/" + sourceName)
    ) {
      return filePath;
    }
  }

  return null;
}

function slugify(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function normalizeApiId(relativePath) {
  const normalizedPath = relativePath.split(path.sep).join("/");
  const withoutExt = normalizedPath.replace(/\.(?:cjs|js|jsx|mjs|ts|tsx)$/, "");

  if (withoutExt.endsWith("/index")) {
    return withoutExt.slice(0, -"/index".length);
  }

  return withoutExt;
}

function getReflectionKindSlug(kind) {
  const kindName = ReflectionKind[kind];
  return typeof kindName === "string"
    ? kindName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
    : `kind-${kind}`;
}

function getApiEntryId(relativePath, reflection) {
  const baseId = normalizeApiId(relativePath);
  const entrySlug = `${getReflectionKindSlug(reflection.kind)}-${slugify(reflection.name || "entry")}`;

  if (!baseId || baseId === "index") {
    return entrySlug;
  }

  return `${baseId}/${entrySlug}`;
}

async function getApiTsConfigPath() {
  const candidates = [
    path.resolve(projectRootDir, ".configs/tsconfig.lib.json"),
    path.resolve(projectRootDir, "tsconfig.json")
  ];

  for (const candidate of candidates) {
    try {
      await stat(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return undefined;
}

async function createApiProject(entryPoints) {
  const options = {
    entryPoints,
    entryPointStrategy: "resolve",
    excludeExternals: true,
    logLevel: "Error",
    skipErrorChecking: true
  };
  const tsconfig = await getApiTsConfigPath();

  if (tsconfig) {
    options.tsconfig = tsconfig;
  }

  const app = await Application.bootstrap(options);
  const project = await app.convert();

  return project ? { app, project } : null;
}

async function loadApiEntries() {
  const relativePaths = (await collectSourceFiles(apiRoot, apiRoot))
    .map((relativePath) => relativePath.split(path.sep).join("/"))
    .sort((a, b) => a.localeCompare(b));

  if (relativePaths.length === 0) {
    return [];
  }

  const filePaths = relativePaths.map((relativePath) => path.join(apiRoot, relativePath));
  const rootEntryPoint = filePaths.find((filePath) => {
    const relativePath = path.relative(apiRoot, filePath).split(path.sep).join("/");
    return /^(?:index)\.(?:cjs|js|jsx|mjs|ts|tsx)$/.test(relativePath);
  });
  const entryPoints = rootEntryPoint ? [rootEntryPoint] : filePaths;
  const result = await createApiProject(entryPoints);

  if (!result) {
    throw new Error("TypeDoc could not create an API reflection model");
  }

  const serializedProject = result.app.serializer.projectToObject(result.project, projectRootDir);
  const sourceFiles = [...new Set(filePaths)];
  const reflections = collectTopLevelReflections(serializedProject.children);
  const entries = new Map();

  for (const reflection of reflections) {
    const filePath = resolveReflectionSourcePath(reflection, sourceFiles);

    if (!filePath) {
      continue;
    }

    const relativePath = path.relative(apiRoot, filePath).split(path.sep).join("/");
    const id = getApiEntryId(relativePath, reflection);

    if (!entries.has(id)) {
      entries.set(id, {
        id,
        data: reflection,
        filePath
      });
    }
  }

  return [...entries.values()].sort((a, b) => a.id.localeCompare(b.id));
}

const examples = defineCollection({
  loader: {
    name: "examples-loader",
    async load({ store, parseData, watcher, logger, meta, generateDigest }) {
      await syncExampleEntries({
        examplesRoot,
        parseData,
        store,
        meta,
        generateDigest
      });

      if (!watcher) {
        return;
      }

      watcher.add(examplesRoot);

      let syncQueue = Promise.resolve();
      const scheduleSync = () => {
        syncQueue = syncQueue
          .then(async () => {
            const changed = await syncExampleEntries({
              examplesRoot,
              parseData,
              store,
              meta,
              generateDigest
            });
            if (changed) {
              logger.info("Reloaded examples");
            }
          })
          .catch((error) => {
            logger.error(
              `Failed to reload examples: ${error instanceof Error ? error.message : String(error)}`
            );
          });

        return syncQueue;
      };

      watcher.on("add", scheduleSync);
      watcher.on("change", scheduleSync);
      watcher.on("unlink", scheduleSync);
    }
  },
  schema: z.object({
    title: z.string(),
    description: z.string(),
    category: z.string(),
    filePath: z.string(),
    source: z.string()
  })
});

const api = defineCollection({
  loader: {
    name: "api-loader",
    async load({ store, parseData }) {
      const entries = await loadApiEntries();

      store.clear();

      for (const entry of entries) {
        store.set({
          id: entry.id,
          data: await parseData({
            id: entry.id,
            data: entry.data,
            filePath: entry.filePath
          }),
          filePath: path.relative(projectRootDir, entry.filePath).split(path.sep).join("/")
        });
      }
    }
  },
  schema: z.object({
    id: z.number(),
    name: z.string(),
    kind: z.number()
  }).passthrough()
});

const guide = defineCollection({
  loader: glob({
    pattern: "**/*.md",
    base: guideRoot,
    deferRender: true
  }),
  schema: z.object({
    title: z.string()
  })
});

const intro = defineCollection({
  loader: glob({
    pattern: path.basename(introRoot),
    base: path.dirname(introRoot),
    deferRender: true
  }),
  schema: z.object({
    title: z.string().optional()
  })
});

export const collections = {
  intro,
  examples,
  guide,
  api
};
