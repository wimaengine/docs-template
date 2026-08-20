import { getCollection, render } from "astro:content";
import { withBase } from "../utils/url.js";
import { getExamplesRoutePath, getGuideRoutePath, rewriteSiteRoute } from "./site.js";

function cleanLabel(value) {
  return value.replace(/^\s*\d+[.)-]?\s+/, "").trim();
}

function getPageLabel(headings, preferredDepth, fallback) {
  const preferredHeading = headings.find((heading) => heading.depth === preferredDepth);
  const fallbackHeading = headings[0];
  return cleanLabel(preferredHeading?.text ?? fallbackHeading?.text ?? fallback);
}

function toNavTab(node) {
  const children = node.children.map(toNavTab);

  return children.length > 0
    ? {
        label: node.label,
        href: node.href,
        children
      }
    : {
        label: node.label,
        href: node.href
      };
}

function buildHeadingTree(headings, basePath) {
  const roots = [];
  const stack = [];

  for (const heading of headings) {
    const node = {
      depth: heading.depth,
      label: cleanLabel(heading.text),
      href: withBase(`${basePath}#${heading.slug}`),
      children: []
    };

    while (stack.length > 0 && stack[stack.length - 1].depth >= heading.depth) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return roots.map(toNavTab);
}

function buildPageTab(headings, basePath, options) {
  const preferredDepth = options.preferredDepth ?? 1;
  const label = getPageLabel(headings, preferredDepth, options.fallback);
  const children = buildHeadingTree(headings.filter((heading) => heading.depth > 1), basePath);

  if (options.trimMatchingFirstChild && children[0]?.label === label) {
    children.shift();
  }

  return children.length > 0
    ? {
        label,
        href: withBase(basePath),
        children
      }
    : {
        label,
        href: withBase(basePath)
      };
}

function parseReadingOrder(raw) {
  const entries = [];
  const lines = raw.split(/\r?\n/);
  let inReadingOrder = false;
  let sourceOrder = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      const headingText = cleanLabel(headingMatch[1].trim());
      if (inReadingOrder && headingText !== "Reading Order") {
        break;
      }

      inReadingOrder = headingText === "Reading Order";
      continue;
    }

    if (!inReadingOrder) {
      continue;
    }

    const itemMatch = line.match(/^\s*(\d+)\.\s+\[(.+?)\]\((.+?)\)\s*$/);
    if (!itemMatch) {
      continue;
    }

    const [, order, , href] = itemMatch;
    entries.push({
      href: rewriteSiteRoute(href).replace(/\/+$/, ""),
      order: Number.parseInt(order, 10) || sourceOrder,
      sourceOrder
    });
    sourceOrder += 1;
  }

  return entries.sort((a, b) => a.order - b.order || a.sourceOrder - b.sourceOrder);
}

function getGuideRoute(entry) {
  const raw = entry.slug ?? entry.id;
  const cleaned = raw.replace(/\.md$/, "");
  return cleaned === "index" ? getGuideRoutePath() : getGuideRoutePath(cleaned);
}

const guideRootPath = getGuideRoutePath();
const examplesRootPath = getExamplesRoutePath();
const introEntries = await getCollection("intro");
const introEntry = introEntries[0];

if (!introEntry) {
  throw new Error("Missing introduction entry");
}

const introRendered = await render(introEntry);
const readmeHeadings = introRendered.headings;

const guideEntries = await getCollection("guide");
const guideIndexEntry = guideEntries.find((entry) => getGuideRoute(entry) === guideRootPath);

if (!guideIndexEntry) {
  throw new Error("Missing guide index entry");
}

const guideIndexRaw = guideIndexEntry.body;
const readingOrder = parseReadingOrder(guideIndexRaw);
const guideIndexRendered = await render(guideIndexEntry);
const guideIndexHeadings = guideIndexRendered.headings;

const readingOrderIndex = new Map(
  readingOrder.map((entry, index) => [entry.href.replace(/\/+$/, ""), index]),
);

const guideChapters = guideEntries
  .filter((entry) => getGuideRoute(entry) !== guideRootPath)
  .map((entry, index) => ({
    entry,
    index,
    route: getGuideRoute(entry)
  }))
  .sort((a, b) => {
    const aOrder = readingOrderIndex.get(a.route) ?? a.index;
    const bOrder = readingOrderIndex.get(b.route) ?? b.index;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.route.localeCompare(b.route);
  });

const sidebarTabs = [
  {
    label: "Introduction",
    children: buildHeadingTree(readmeHeadings.filter((heading) => heading.depth > 1), "/")
  },
  {
    label: "Guide",
    children: [
      buildPageTab(guideIndexHeadings, guideRootPath, {
        fallback: "Guide",
        preferredDepth: 2,
        trimMatchingFirstChild: true
      }),
      ...await Promise.all(
        guideChapters.map(async ({ entry, route }) => {
          const rendered = await render(entry);
          const headings = rendered.headings;
          const label = getPageLabel(headings, 1, entry.data.title);

          return buildPageTab(headings, route, {
            fallback: label,
            preferredDepth: 1
          });
        })
      )
    ]
  },
  {
    label: "Examples",
    href: withBase(examplesRootPath)
  }
];

export { sidebarTabs };
