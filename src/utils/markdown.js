import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
import { projectRootDir } from "../config/project.js";
import { markdownPlugins } from "../plugins/markdown-satteri.js";

let markdownProcessorPromise;

function getMarkdownProcessor() {
  markdownProcessorPromise ??= createSatteriMarkdownProcessor({
    features: {
      directive: true
    },
    mdastPlugins: markdownPlugins
  });

  return markdownProcessorPromise;
}

function resolveSourcePath(value) {
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

export async function renderMarkdown(value, { sourcePath } = {}) {
  const markdown = String(value ?? "").trim();
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
