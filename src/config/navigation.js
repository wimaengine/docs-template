import { getCollection } from "astro:content";
import { withBase } from "../utils/url.js";
import { getApiEntryRoute, getApiRoutePath, getExamplesRoutePath, getGuideRoutePath, rewriteSiteRoute } from "./site.js";
import { getReflectionKindLabel, getReflectionKindSlug } from "../utils/typedoc.js";

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

function getApiKindOrder(kind) {
  const order = ["class", "enum", "variable", "function", "interface", "type-alias"];
  const slug = getReflectionKindSlug(kind);
  const index = order.indexOf(slug);
  return index === -1 ? order.length : index;
}

function getApiBadge(kind) {
  const name = getReflectionKindLabel(kind).toLowerCase();
  return {
    letter: name.charAt(0).toUpperCase(),
    name
  };
}

function createApiNavigation(apiEntries) {
  const groups = new Map();

  for (const entry of apiEntries) {
    const key = getReflectionKindSlug(entry.data.kind);
    const group = groups.get(key) ?? { kind: entry.data.kind, items: [] };
    group.items.push({
      label: entry.data.name,
      href: withBase(getApiEntryRoute(entry)),
      badge: getApiBadge(entry.data.kind)
    });
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((a, b) => getApiKindOrder(a.kind) - getApiKindOrder(b.kind))
    .map((group) => ({
      label: getReflectionKindLabel(group.kind, true),
      children: group.items
        .sort((a, b) => a.label.localeCompare(b.label))
        .map((item) => ({
          label: item.label,
          href: item.href,
          badge: item.badge
        }))
    }));
}

const guideRootPath = getGuideRoutePath();
const apiRootPath = getApiRoutePath();
const examplesRootPath = getExamplesRoutePath();
const [introEntries, guideEntries, apiEntries] = await Promise.all([
  getCollection("intro"),
  getCollection("guide"),
  getCollection("api")
]);
const introEntry = introEntries[0];

if (!introEntry) {
  throw new Error("Missing introduction entry");
}

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
        label: "Introduction",
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
    children: [
      {
        label: "Introduction",
        href: withBase(apiRootPath)
      },
      ...createApiNavigation(apiEntries)
    ]
  },
  {
    label: "Examples",
    href: withBase(examplesRootPath)
  }
];

export { sidebarTabs };
