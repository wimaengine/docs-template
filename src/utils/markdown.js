import { createSatteriMarkdownProcessor } from "@astrojs/markdown-satteri";
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

export async function renderMarkdown(value) {
  const markdown = String(value ?? "").trim();
  if (!markdown) {
    return "";
  }

  const renderer = await getMarkdownProcessor();
  const result = await renderer.render(markdown);
  return result.code;
}
