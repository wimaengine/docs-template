import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
import { projectRootDir } from "../config/project.ts";
import { markdownPlugins } from "../plugins/markdown-satteri.ts";

let markdownProcessorPromise:
  Promise<Awaited<ReturnType<typeof createSatteriMarkdownProcessor>>> | undefined;

function getMarkdownProcessor(): Promise<Awaited<ReturnType<typeof createSatteriMarkdownProcessor>>> {
  markdownProcessorPromise ??= createSatteriMarkdownProcessor({
    features: {
      directive: true
    },
    mdastPlugins: markdownPlugins
  });

  return markdownProcessorPromise;
}

function resolveSourcePath(value: string | URL | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof URL || (typeof value === "string" && /^file:/i.test(value))) {
    try {
      return fileURLToPath(value);
    } catch {
      return undefined;
    }
  }

  const raw = String(value).trim();
  if (!raw) {
    return undefined;
  }

  if (path.isAbsolute(raw)) {
    const normalized = path.normalize(raw);
    const relative = path.relative(projectRootDir, normalized);

    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
      return normalized;
    }

    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return path.resolve(projectRootDir, raw.slice(1));
    }

    return normalized;
  }

  return path.resolve(projectRootDir, raw);
}

export async function renderMarkdown(
  value: string,
  { sourcePath }: { sourcePath?: string | URL } = {}
): Promise<string> {
  const markdown = value.trim();
  if (!markdown) {
    return "";
  }

  const renderer = await getMarkdownProcessor();
  const resolvedSourcePath = resolveSourcePath(sourcePath);
  const result = await renderer.render(markdown, {
    fileURL: resolvedSourcePath ? pathToFileURL(resolvedSourcePath) : undefined
  });
  return result.code;
}
