import { getCollection } from "astro:content";
import { withBase } from "../utils/url.js";
import { getApiRoutePath, getExamplesRoutePath, getGuideRoutePath, rewriteSiteRoute } from "./site.js";
import { getReflectionKindLabel, getReflectionKindSlug } from "../utils/typedoc.js";

export interface NavTab {
  label: string;
  href?: string;
  children?: NavTab[];
  badge?: {
    letter: string;
    name: string;
  };
}

interface GuideCollectionEntry {
  id: string;
  slug?: string;
  body: string;
  data: {
    title: string;
  };
}

interface IntroCollectionEntry {
  id: string;
  body: string;
  data: {
    title?: string;
  };
}

interface ReadingOrderEntry {
  href: string;
  order: number;
  sourceOrder: number;
}

interface OrderedGuideEntry {
  entry: GuideCollectionEntry;
  index: number;
  route: string;
}

interface ApiCollectionEntry {
  id: string;
  data: {
    name: string;
    kind: number;
  };
}

interface ApiNavigationGroup {
  kind: number;
  items: Array<{
    label: string;
    href: string;
    badge: {
      letter: string;
      name: string;
    };
  }>;
}

function cleanLabel(value: string): string {
  return value.replace(/^\s*\d+[.)-]?\s+/, "").trim();
}

function parseReadingOrder(raw: string): ReadingOrderEntry[] {
  const entries: ReadingOrderEntry[] = [];
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

function getGuideRoute(entry: { id: string; slug?: string }): string {
  const raw = entry.slug ?? entry.id;
  const cleaned = raw.replace(/\.md$/, "");
  return cleaned === "index" ? getGuideRoutePath() : getGuideRoutePath(cleaned);
}

function getApiKindOrder(kind: number): number {
  const order = ["class", "enum", "variable", "function", "interface", "type-alias"];
  const slug = getReflectionKindSlug(kind);
  const index = order.indexOf(slug);
  return index === -1 ? order.length : index;
}

function getApiBadge(kind: number): { letter: string; name: string } {
  const name = getReflectionKindLabel(kind).toLowerCase();
  return {
    letter: name.charAt(0).toUpperCase(),
    name
  };
}

function createApiNavigation(apiEntries: ApiCollectionEntry[]): NavTab[] {
  const groups = new Map<string, ApiNavigationGroup>();

  for (const entry of apiEntries) {
    const key = getReflectionKindSlug(entry.data.kind);
    const group = groups.get(key) ?? { kind: entry.data.kind, items: [] };
    group.items.push({
      label: entry.data.name,
      href: withBase(getApiRoutePath(entry.id)),
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
]) as [IntroCollectionEntry[], GuideCollectionEntry[], ApiCollectionEntry[]];
const introEntry = introEntries[0];

if (!introEntry) {
  throw new Error("Missing introduction entry");
}

const guideIndexEntry = guideEntries.find((entry: GuideCollectionEntry) => getGuideRoute(entry) === guideRootPath);

if (!guideIndexEntry) {
  throw new Error("Missing guide index entry");
}

const guideIndexRaw = guideIndexEntry.body;
const readingOrder = parseReadingOrder(guideIndexRaw);

const readingOrderIndex = new Map<string, number>(
  readingOrder.map((entry, index) => [entry.href.replace(/\/+$/, ""), index])
);

const guideChapters: OrderedGuideEntry[] = guideEntries
  .filter((entry: GuideCollectionEntry) => getGuideRoute(entry) !== guideRootPath)
  .map((entry: GuideCollectionEntry, index: number) => ({
    entry,
    index,
    route: getGuideRoute(entry)
  }))
  .sort((a: OrderedGuideEntry, b: OrderedGuideEntry) => {
    const aOrder = readingOrderIndex.get(a.route) ?? a.index;
    const bOrder = readingOrderIndex.get(b.route) ?? b.index;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.route.localeCompare(b.route);
  });

const sidebarTabs: NavTab[] = [
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
      ...guideChapters.map(({ entry, route }: OrderedGuideEntry) => ({
        label: cleanLabel(entry.data.title),
        href: withBase(route)
      }))
    ]
  },
  {
    label: "API",
    children: [
      {
        label: "API",
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
