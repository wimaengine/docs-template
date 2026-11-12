import { withBase } from "../utils/url.ts";
import { resolveGuideLink } from "../utils/guide-links.ts";
import type { Image, Link } from "mdast";
import type { MdastContent, MdastNode, MdastPluginDefinition, MdastVisitorContext } from "satteri";

const alertLabels = {
  note: "Note",
  tip: "Tip",
  important: "Important",
  warning: "Warning",
  caution: "Caution",
};

function rewriteBaseUrl(node: Link | Image, ctx: MdastVisitorContext): void {
  if (
    !/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(node.url)
  ) {
    if (node.url.startsWith("#") || node.url.startsWith("?")) {
      return;
    }

    const resolvedUrl = resolveGuideLink(node.url, ctx.fileURL);
    ctx.setProperty(node, "url", withBase(resolvedUrl));
  }
}

function createAlertNode(
  type: keyof typeof alertLabels,
  children: Extract<MdastNode, { type: "containerDirective" }>["children"]
): MdastContent {
  return {
    type: "containerDirective" as const,
    name: type,
    data: {
      hName: "div",
      hProperties: {
        className: ["markdown-alert", `markdown-alert-${type}`],
      },
    },
    children: [
      {
        type: "paragraph" as const,
        data: {
          hProperties: {
            className: ["markdown-alert-title"],
          },
        },
        children: [{ type: "text" as const, value: alertLabels[type] }],
      },
      ...children,
    ],
  };
}

export const markdownPlugins: MdastPluginDefinition[] = [
  {
    name: "directive-alerts",
    containerDirective(
      node: Extract<MdastNode, { type: "containerDirective" }>,
      ctx: MdastVisitorContext
    ): void {
      const type = node.name.toLowerCase();
      if (!(type in alertLabels)) {
        return;
      }

      // Use Satteri's native directive node shape instead of raw HTML.
      ctx.replaceNode(node, createAlertNode(type as keyof typeof alertLabels, node.children));
    },
  },
  {
    name: "rewrite-base-urls",
    link: rewriteBaseUrl,
    image: rewriteBaseUrl,
  },
];
