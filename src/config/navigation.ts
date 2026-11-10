import { getCollection } from "astro:content";
import { withBase } from "../utils/url.js";
import { getApiEntryRoute, getApiRoutePath, getExamplesRoutePath, getGuideRoutePath, rewriteSiteRoute } from "./site.js";
import { getReflectionKindLabel } from "../utils/typedoc.js";

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
    id: number;
    name: string;
    kind: number;
    [key: string]: unknown;
  };
}

interface ApiNavigationEntry {
  label: string;
  href: string;
  badge: {
    letter: string;
    name: string;
  };
}

interface ApiNavigationNode {
  segment: string;
  entry: ApiNavigationEntry | null;
  children: Map<string, ApiNavigationNode>;
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

function getApiBadge(kind: number): { letter: string; name: string } {
  const name = getReflectionKindLabel(kind).toLowerCase();
  return {
    letter: name.charAt(0).toUpperCase(),
    name
  };
}

function formatApiNavigationGroupLabel(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

function getApiRouteSegments(route: string, apiRootPath: string): string[] {
  const prefix = `${apiRootPath}/`;

  if (!route.startsWith(prefix)) {
    throw new Error(`API route "${route}" is outside the configured API route "${apiRootPath}".`);
  }

  return route.slice(prefix.length).split("/").filter(Boolean);
}

function createApiNavigation(apiEntries: ApiCollectionEntry[], apiRootPath: string): NavTab[] {
  const root: ApiNavigationNode = {
    segment: "",
    entry: null,
    children: new Map()
  };

  for (const entry of apiEntries) {
    const route = getApiEntryRoute(entry);
    const segments = getApiRouteSegments(route, apiRootPath);

    if (segments.length === 0) {
      throw new Error(`API entry "${entry.id}" did not produce a nested route.`);
    }

    let node = root;

    for (const segment of segments) {
      let child = node.children.get(segment);

      if (!child) {
        child = {
          segment,
          entry: null,
          children: new Map()
        };
        node.children.set(segment, child);
      }

      node = child;
    }

    if (node.entry) {
      throw new Error(`API route collision: "${route}" is used by multiple entries.`);
    }

    node.entry = {
      label: entry.data.name,
      href: withBase(route),
      badge: getApiBadge(entry.data.kind)
    };
  }

  function renderNode(node: ApiNavigationNode): NavTab[] {
    return [...node.children.values()]
      .sort((a, b) => a.segment.localeCompare(b.segment))
      .map((child) => {
        const children = renderNode(child);
        const item: NavTab = child.entry ?? {
          label: formatApiNavigationGroupLabel(child.segment)
        };

        return children.length > 0 ? { ...item, children } : item;
      });
  }

  return renderNode(root);
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
        label: "Introduction",
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
        label: "Introduction",
        href: withBase(apiRootPath)
      },
      ...createApiNavigation(apiEntries, apiRootPath)
    ]
  },
  {
    label: "Examples",
    href: withBase(examplesRootPath)
  }
];

export { sidebarTabs };
