import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { projectRootDir } from "./config/project.js";
import { getExamplesContentDir, getGuideContentDir, getIntroContentPath } from "./config/site.js";

const examplesRoot = getExamplesContentDir();
const guideRoot = getGuideContentDir();
const introRoot = getIntroContentPath();

function toDisplayPath(filePath: string): string {
  const relativePath = path.relative(projectRootDir, filePath).split(path.sep).join("/");
  return relativePath.startsWith("..") ? relativePath : `/${relativePath}`;
}

interface ExampleEntry {
  id: string;
  title: string;
  description: string;
  category: string;
  filePath: string;
  source: string;
}

function toTitle(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
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
}: {
  examplesRoot: string;
  parseData: (props: { id: string; data: ExampleEntry; filePath: string }) => Promise<ExampleEntry>;
  store: {
    clear: () => void;
    set: (entry: { id: string; data: ExampleEntry; filePath: string }) => void;
  };
  meta: {
    get: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
  };
  generateDigest: (data: Record<string, unknown> | string) => string;
}): Promise<boolean> {
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

  const validEntries = entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null).sort((a, b) => a.id.localeCompare(b.id));
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
  guide
};
