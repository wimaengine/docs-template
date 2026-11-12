import { defineCollection, z } from "astro:content";
import type { DataEntry } from "astro:content";
import {
  glob,
  type DataStore,
  type Loader,
  type LoaderContext,
  type MetaStore,
  type ParseDataOptions
} from "astro/loaders";
import {
  Application,
  ReflectionKind,
  type JSONOutput,
  type ProjectReflection,
  type TypeDocOptions
} from "typedoc";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { projectRootDir } from "./config/project.ts";
import {
  addApiLinks,
  addApiPackageLinks,
  addExampleLinks,
  addGuideLinks,
  addIntroLinks
} from "./config/links.ts";
import { getApiSourceDir, getExamplesContentDir, getGuideContentDir, getIntroContentPath } from "./config/site.ts";

interface ApiLoaderEntry {
  id: string;
  data: JSONOutput.DeclarationReflection;
  filePath: string;
}

interface DeferredGlobLoaderOptions {
  getBase: () => string;
  getPattern: () => string;
  onStart?: () => void;
  onEntry?: (entry: DataEntry) => void;
  onEntries?: (entries: DataEntry[]) => void;
}

interface ExampleEntry {
  id: string;
  filePath: string;
  data: {
    title: string;
    filePath: string;
    source: string;
  };
}

interface ExampleSyncContext {
  examplesRoot: string;
  parseData: <TData extends Record<string, unknown>>(
    options: ParseDataOptions<TData>
  ) => Promise<TData>;
  store: DataStore;
  meta: MetaStore;
  generateDigest: (data: Record<string, unknown> | string) => string;
}

const apiSourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const supportedApiKinds = new Set([
  ReflectionKind.Class,
  ReflectionKind.Enum,
  ReflectionKind.Function,
  ReflectionKind.Variable,
  ReflectionKind.Interface,
  ReflectionKind.TypeAlias
]);

function toDisplayPath(filePath: string): string {
  const relativePath = path.relative(projectRootDir, filePath).split(path.sep).join("/");
  return relativePath.startsWith("..") ? relativePath : `/${relativePath}`;
}

function toTitle(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function createDeferredGlobLoader({
  getBase,
  getPattern,
  onStart,
  onEntry,
  onEntries
}: DeferredGlobLoaderOptions): Loader {
  return {
    name: "glob-loader",
    async load(context: LoaderContext): Promise<void> {
      // The integration sets the host project's content paths while Astro
      // evaluates astro.config.*. Resolve them only when Astro runs the
      // loader, because content.config.* can be evaluated first.
      const loader = glob({
        pattern: getPattern(),
        base: getBase(),
        deferRender: true
      });

      onStart?.();
      const store = new Proxy(context.store, {
        get(target, property, receiver) {
          if (property === "set") {
            return (entry: DataEntry) => {
              const result = target.set(entry);
              onEntry?.(entry);
              return result;
            };
          }

          return Reflect.get(target, property, receiver);
        }
      });

      await loader.load({ ...context, store });

      const entries = context.store.values();
      onEntries?.(entries);
    }
  };
}

async function collectExampleFiles(dir: string, root: string): Promise<string[]> {
  const dirEntries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

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
async function syncExampleEntries({
  examplesRoot,
  parseData,
  store,
  meta,
  generateDigest
}: ExampleSyncContext): Promise<boolean> {
  const relativePaths = (await collectExampleFiles(examplesRoot, examplesRoot)).sort((a, b) => a.localeCompare(b));
  const entries = await Promise.all(
    relativePaths.map(async (relativePath) => {
      const normalizedPath = relativePath.split(path.sep).join("/");
      const id = normalizedPath.replace(/\.js$/, "");
      const segments = id.split("/");
      const fileName = segments.at(-1) || "example";
      const absoluteFilePath = path.join(examplesRoot, relativePath);
      const storedFilePath = path.relative(projectRootDir, absoluteFilePath).split(path.sep).join("/");

      let source: string;
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
          filePath: toDisplayPath(absoluteFilePath),
          source
        }
      };
    })
  );

  const validEntries = entries
    .filter((entry): entry is ExampleEntry => entry !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  addExampleLinks(validEntries);
  const digest = generateDigest(JSON.stringify(validEntries));
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

function isApiSourceFile(fileName: string): boolean {
  return apiSourceExtensions.has(path.extname(fileName).toLowerCase());
}

async function collectSourceFiles(dir: string, root: string): Promise<string[]> {
  const dirEntries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const dirEntry of dirEntries) {
    const fullPath = path.join(dir, dirEntry.name);
    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");

    if (dirEntry.isDirectory()) {
      if (
        dirEntry.name === "node_modules" ||
        dirEntry.name === "dist" ||
        dirEntry.name === "build" ||
        dirEntry.name === "types"
      ) {
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

function isSupportedReflection(
  reflection: JSONOutput.SomeReflection
): reflection is JSONOutput.DeclarationReflection {
  return reflection.variant === "declaration" && supportedApiKinds.has(reflection.kind);
}

function collectTopLevelReflections(
  reflections: JSONOutput.SomeReflection[] | undefined,
  output: JSONOutput.DeclarationReflection[] = []
): JSONOutput.DeclarationReflection[] {
  for (const reflection of reflections ?? []) {
    if (isSupportedReflection(reflection)) {
      output.push(reflection);
      continue;
    }

    if (reflection.kind === ReflectionKind.Module || reflection.kind === ReflectionKind.Namespace) {
      const children = "children" in reflection ? reflection.children : undefined;
      collectTopLevelReflections(children, output);
    }
  }

  return output;
}

function resolveReflectionSourcePath(
  reflection: JSONOutput.DeclarationReflection,
  sourceFiles: string[],
  apiRoot: string
): string | null {
  const source = reflection.sources?.[0];

  if (!source) {
    return null;
  }

  const sourceName = source.fileName.split(path.sep).join("/");
  const normalizedAbsoluteName = path.isAbsolute(sourceName) ? path.normalize(sourceName) : null;
  const pathMatches = (left: string, right: string): boolean => (
    left === right ||
    left.endsWith(`/${right}`) ||
    right.endsWith(`/${left}`)
  );

  for (const filePath of sourceFiles) {
    const relativeToApi = path.relative(apiRoot, filePath).split(path.sep).join("/");
    const relativeToProject = path.relative(projectRootDir, filePath).split(path.sep).join("/");

    if (
      (normalizedAbsoluteName && path.normalize(filePath) === normalizedAbsoluteName) ||
      pathMatches(relativeToApi, sourceName) ||
      pathMatches(relativeToProject, sourceName)
    ) {
      return filePath;
    }
  }

  return null;
}

function slugify(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function normalizeApiId(relativePath: string): string {
  const normalizedPath = relativePath.split(path.sep).join("/");
  const withoutExt = normalizedPath.replace(/\.(?:cjs|js|jsx|mjs|ts|tsx)$/, "");

  if (withoutExt.endsWith("/index")) {
    return withoutExt.slice(0, -"/index".length);
  }

  return withoutExt;
}

function getReflectionKindSlug(kind: number): string {
  const kindName = ReflectionKind[kind];
  return typeof kindName === "string"
    ? kindName.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase()
    : `kind-${kind}`;
}

function getApiEntryId(relativePath: string, reflection: JSONOutput.DeclarationReflection): string {
  const baseId = normalizeApiId(relativePath);
  const entrySlug = `${getReflectionKindSlug(reflection.kind)}-${slugify(reflection.name || "entry")}`;

  if (!baseId || baseId === "index") {
    return entrySlug;
  }

  return `${baseId}/${entrySlug}`;
}

function getJsDocComment(source: string, line: number | undefined): string {
  if (!source || !Number.isInteger(line) || line < 1) {
    return "";
  }

  const lines = source.split(/\r?\n/);
  let end = line - 2;

  while (end >= 0 && lines[end].trim() === "") {
    end -= 1;
  }

  if (end < 0 || !lines[end].trim().endsWith("*/")) {
    return "";
  }

  let start = end;
  while (start >= 0 && !lines[start].includes("/**")) {
    start -= 1;
  }

  return start >= 0 ? lines.slice(start, end + 1).join("\n") : "";
}

function getJsDocRelationTypes(
  source: string,
  line: number | undefined,
  tagName: string
): JSONOutput.SomeType[] {
  const comment = getJsDocComment(source, line);
  if (!comment) {
    return [];
  }

  const pattern = new RegExp(`@${tagName}\\s+(?:\\{([^}]+)\\}|([^\\s*]+))`, "g");
  const types: JSONOutput.SomeType[] = [];

  for (const match of comment.matchAll(pattern)) {
    const name = (match[1] ?? match[2] ?? "").trim();
    if (!name) {
      continue;
    }

    types.push({
      type: "reference",
      name,
      qualifiedName: name,
      target: -1 as JSONOutput.ReflectionId,
      typeArguments: []
    } as Extract<JSONOutput.SomeType, { type: "reference" }>);
  }

  return types;
}

async function getSourceText(filePath: string, sourceCache: Map<string, string>): Promise<string> {
  if (!sourceCache.has(filePath)) {
    sourceCache.set(filePath, await readFile(filePath, "utf8"));
  }

  return sourceCache.get(filePath)!;
}

async function getApiTsConfigPath(): Promise<string | undefined> {
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

async function createApiProject(entryPoints: string[]): Promise<{ app: Application; project: ProjectReflection } | null> {
  const options: TypeDocOptions = {
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

async function loadApiEntries(): Promise<ApiLoaderEntry[]> {
  const apiRoot = getApiSourceDir();
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
  const entries = new Map<string, ApiLoaderEntry>();
  const sourceCache = new Map<string, string>();

  for (const reflection of reflections) {
    const filePath = resolveReflectionSourcePath(reflection, sourceFiles, apiRoot);

    if (!filePath) {
      continue;
    }

    if (reflection.kind === ReflectionKind.Class) {
      const source = await getSourceText(filePath, sourceCache);
      const sourceLine = reflection.sources?.[0]?.line;

      if (!reflection.extendedTypes?.length) {
        const extendedTypes = getJsDocRelationTypes(source, sourceLine, "extends");
        if (extendedTypes.length > 0) {
          reflection.extendedTypes = extendedTypes;
        }
      }

      if (!reflection.implementedTypes?.length) {
        const implementedTypes = getJsDocRelationTypes(source, sourceLine, "implements");
        if (implementedTypes.length > 0) {
          reflection.implementedTypes = implementedTypes;
        }
      }
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
      const examplesRoot = getExamplesContentDir();

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
      addApiLinks(entries);

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
  loader: createDeferredGlobLoader({
    getBase: getGuideContentDir,
    getPattern: () => "**/*.md",
    onEntries: addGuideLinks
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    noindex: z.boolean().optional()
  })
});

const apiPackages = defineCollection({
  loader: createDeferredGlobLoader({
    getBase: getApiSourceDir,
    getPattern: () => "*/README.md",
    onEntries: addApiPackageLinks
  }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    noindex: z.boolean().optional()
  })
});

const intro = defineCollection({
  loader: createDeferredGlobLoader({
    getBase: () => path.dirname(getIntroContentPath()),
    getPattern: () => path.basename(getIntroContentPath()),
    onEntries: addIntroLinks
  }),
  schema: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    ogImage: z.string().optional(),
    noindex: z.boolean().optional()
  })
});

export const collections = {
  intro,
  examples,
  guide,
  api,
  apiPackages
};
