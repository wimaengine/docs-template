import { getCollection } from "astro:content";
import { withBase } from "../utils/url.js";
import { getApiRoutePath, getExamplesRoutePath, getGuideRoutePath, rewriteSiteRoute } from "./site.js";

function cleanLabel(value) {
  return value.replace(/^\s*\d+[.)-]?\s+/, "").trim();
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
const apiRootPath = getApiRoutePath();
const examplesRootPath = getExamplesRoutePath();
const introEntries = await getCollection("intro");
const introEntry = introEntries[0];

if (!introEntry) {
  throw new Error("Missing introduction entry");
}

const guideEntries = await getCollection("guide");
const guideIndexEntry = guideEntries.find((entry) => getGuideRoute(entry) === guideRootPath);

if (!guideIndexEntry) {
  throw new Error("Missing guide index entry");
}

const guideIndexRaw = guideIndexEntry.body;
const readingOrder = parseReadingOrder(guideIndexRaw);

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
    href: withBase("/")
  },
  {
    label: "Guide",
    children: [
      {
        label: "Guide",
        href: withBase(guideRootPath)
      },
      ...guideChapters.map(({ entry, route }) => ({
        label: cleanLabel(entry.data.title),
        href: withBase(route)
      }))
    ]
  },
  {
    label: "API",
    href: withBase(apiRootPath)
  },
  {
    label: "Examples",
    href: withBase(examplesRootPath)
  }
];

export { sidebarTabs };
