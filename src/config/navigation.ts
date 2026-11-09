import { getCollection } from "astro:content";
import { withBase } from "../utils/url.js";
import { getApiRoutePath, getExamplesRoutePath, getGuideRoutePath, rewriteSiteRoute } from "./site.js";

export interface NavTab {
  label: string;
  href?: string;
  children?: NavTab[];
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

const guideRootPath = getGuideRoutePath();
const examplesRootPath = getExamplesRoutePath();
const introEntries = (await getCollection("intro")) as IntroCollectionEntry[];
const introEntry = introEntries[0];

if (!introEntry) {
  throw new Error("Missing introduction entry");
}

const guideEntries = (await getCollection("guide")) as GuideCollectionEntry[];
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
    href: withBase(getApiRoutePath())
  },
  {
    label: "Examples",
    href: withBase(examplesRootPath)
  }
];

export { sidebarTabs };
