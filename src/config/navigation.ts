import { getCollection } from "astro:content";
import { withBase } from "../utils/url.js";
import { getApiEntryRoute, getApiPackageRoute, getApiRoutePath, getExamplesRoutePath, getGuideEntryRoute, getGuideRoutePath } from "./site.js";
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

interface ExampleCollectionEntry {
  id: string;
  filePath?: string;
  data: {
    title: string;
    description: string;
    category: string;
    filePath: string;
    source: string;
  };
}

interface ReadingOrderEntry {
  href: string;
  order: number;
  sourceOrder: number;
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

interface ApiPackageCollectionEntry {
  id: string;
  data: {
    title: string;
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
  overview: { label: string; href: string } | null;
  label: string | null;
  children: Map<string, ApiNavigationNode>;
}

interface GuideNavigationEntry {
  label: string;
  href: string;
}

interface GuideNavigationNode {
  segment: string;
  entry: GuideNavigationEntry | null;
  children: Map<string, GuideNavigationNode>;
  order: number;
}

function cleanLabel(value: string): string {
  return value.replace(/^\s*\d+[.)-]?\s+/, "").trim();
}

function stripGuideOrderPrefix(value: string): string {
  const stripped = value.replace(/^\d+(?:[.)_-]|\s)+/, "");
  return stripped || value;
}

function normalizeGuideNavigationRoute(value: string, guideRootPath: string): string {
  const withoutExtension = value.replace(/\.[^/.]+$/, "");
  let trimmed = withoutExtension.replace(/\/+$/, "") || "/";

  if (trimmed === "/index") {
    return "/";
  }

  if (trimmed.endsWith("/index")) {
    trimmed = trimmed.slice(0, -"/index".length);
  }

  const prefix = `${guideRootPath}/`;
  if (!trimmed.startsWith(prefix)) {
    return trimmed;
  }

  const segments = trimmed.slice(prefix.length).split("/").filter(Boolean).map(stripGuideOrderPrefix);
  return `${guideRootPath}/${segments.join("/")}`;
}

function resolveGuideOrderHref(href: string, guideRootPath: string): string {
  const pathname = new URL(href, `https://docs.invalid${guideRootPath}/`).pathname;
  return normalizeGuideNavigationRoute(pathname, guideRootPath);
}

function parseReadingOrder(raw: string, guideRootPath: string): ReadingOrderEntry[] {
  const entries: ReadingOrderEntry[] = [];
  const lines = raw.split(/\r?\n/);
  let inReadingOrder = false;
  let sourceOrder = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.*)$/);
    if (headingMatch) {
      const headingText = cleanLabel(headingMatch[1].trim());
      const isOrderHeading = headingText === "Reading Order" || headingText === "Recommended Order";
      if (inReadingOrder && !isOrderHeading) {
        break;
      }

      inReadingOrder = isOrderHeading;
      continue;
    }

    if (!inReadingOrder) {
      continue;
    }

    const itemMatch = line.match(/^\s*(?:(\d+)\.|[-*])\s+\[(.+?)\]\((.+?)\)\s*$/);
    if (!itemMatch) {
      continue;
    }

    const [, order, , href] = itemMatch;
    entries.push({
      href: resolveGuideOrderHref(href, guideRootPath),
      order: Number.parseInt(order, 10) || sourceOrder,
      sourceOrder
    });
    sourceOrder += 1;
  }

  return entries.sort((a, b) => a.order - b.order || a.sourceOrder - b.sourceOrder);
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

function getGuideRouteSegments(route: string, guideRootPath: string): string[] {
  const normalizedRoute = normalizeGuideNavigationRoute(route, guideRootPath);
  const prefix = `${guideRootPath}/`;

  if (!normalizedRoute.startsWith(prefix)) {
    throw new Error(`Guide route "${route}" is outside the configured guide route "${guideRootPath}".`);
  }

  return normalizedRoute.slice(prefix.length).split("/").filter(Boolean);
}

function formatGuideNavigationGroupLabel(value: string): string {
  const withoutOrder = value.replace(/^\d+[.)-]?[-_\s]*/, "");
  const formatted = withoutOrder
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter: string) => letter.toUpperCase())
    .trim();

  return formatted || value;
}

function getOrCreateApiNavigationNode(
  root: ApiNavigationNode,
  route: string,
  apiRootPath: string
): ApiNavigationNode {
  const segments = getApiRouteSegments(route, apiRootPath);

  if (segments.length === 0) {
    throw new Error(`API route "${route}" did not produce a nested route.`);
  }

  let node = root;

  for (const segment of segments) {
    let child = node.children.get(segment);

    if (!child) {
      child = {
        segment,
        entry: null,
        overview: null,
        label: null,
        children: new Map()
      };
      node.children.set(segment, child);
    }

    node = child;
  }

  return node;
}

function createApiNavigation(
  apiEntries: ApiCollectionEntry[],
  apiPackageEntries: ApiPackageCollectionEntry[],
  apiRootPath: string
): NavTab[] {
  const root: ApiNavigationNode = {
    segment: "",
    entry: null,
    overview: null,
    label: null,
    children: new Map()
  };

  for (const entry of apiPackageEntries) {
    const route = getApiPackageRoute(entry);
    const node = getOrCreateApiNavigationNode(root, route, apiRootPath);

    if (node.overview) {
      throw new Error(`API package route collision: "${route}" is used by multiple package entries.`);
    }

    node.label = entry.data.title;
    node.overview = {
      label: "Overview",
      href: withBase(route)
    };
  }

  for (const entry of apiEntries) {
    const route = getApiEntryRoute(entry);
    const node = getOrCreateApiNavigationNode(root, route, apiRootPath);

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
          label: child.label ?? formatApiNavigationGroupLabel(child.segment)
        };
        const navigationChildren = [
          ...(child.overview ? [child.overview] : []),
          ...children
        ];

        return navigationChildren.length > 0 ? { ...item, children: navigationChildren } : item;
      });
  }

  return renderNode(root);
}

function createGuideNavigation(
  guideEntries: GuideCollectionEntry[],
  guideRootPath: string,
  readingOrderIndex: Map<string, number>
): NavTab[] {
  const root: GuideNavigationNode = {
    segment: "",
    entry: null,
    children: new Map(),
    order: Number.POSITIVE_INFINITY
  };

  for (const [sourceOrder, entry] of guideEntries.entries()) {
    const route = getGuideEntryRoute(entry);

    if (route === guideRootPath) {
      continue;
    }

    const segments = getGuideRouteSegments(route, guideRootPath);

    if (segments.length === 0) {
      throw new Error(`Guide entry "${entry.id}" did not produce a nested route.`);
    }

    let node = root;

    for (const segment of segments) {
      let child = node.children.get(segment);

      if (!child) {
        child = {
          segment,
          entry: null,
          children: new Map(),
          order: Number.POSITIVE_INFINITY
        };
        node.children.set(segment, child);
      }

      node = child;
    }

    if (node.entry) {
      throw new Error(`Guide navigation collision: "${route}" maps to multiple entries.`);
    }

    node.entry = {
      label: cleanLabel(entry.data.title),
      href: withBase(route)
    };
    node.order = readingOrderIndex.get(normalizeGuideNavigationRoute(route, guideRootPath)) ?? sourceOrder;
  }

  function getNodeOrder(node: GuideNavigationNode): number {
    return [...node.children.values()].reduce(
      (order, child) => Math.min(order, getNodeOrder(child)),
      node.order
    );
  }

  function renderNode(node: GuideNavigationNode): NavTab[] {
    return [...node.children.values()]
      .sort((a, b) => {
        const aOrder = getNodeOrder(a);
        const bOrder = getNodeOrder(b);

        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }

        return a.segment.localeCompare(b.segment);
      })
      .map((child) => {
        const children = renderNode(child);

        if (children.length > 0) {
          return {
            label: child.entry?.label ?? formatGuideNavigationGroupLabel(child.segment),
            children: child.entry?.href
              ? [{ label: "Introduction", href: child.entry.href }, ...children]
              : children
          };
        }

        return child.entry ?? {
          label: formatGuideNavigationGroupLabel(child.segment)
        };
      });
  }

  return renderNode(root);
}

const guideRootPath = getGuideRoutePath();
const apiRootPath = getApiRoutePath();
const examplesRootPath = getExamplesRoutePath();
const [introEntries, guideEntries, examplesEntries, apiEntries, apiPackageEntries] = await Promise.all([
  getCollection("intro"),
  getCollection("guide"),
  getCollection("examples"),
  getCollection("api"),
  getCollection("apiPackages")
]) as [
  IntroCollectionEntry[],
  GuideCollectionEntry[],
  ExampleCollectionEntry[],
  ApiCollectionEntry[],
  ApiPackageCollectionEntry[]
];
const introEntry = introEntries[0];

if (!introEntry) {
  throw new Error("Missing introduction entry");
}

const guideIndexEntry = guideEntries.find((entry: GuideCollectionEntry) => getGuideEntryRoute(entry) === guideRootPath);

if (!guideIndexEntry) {
  throw new Error("Missing guide index entry");
}

const guideIndexRaw = guideIndexEntry.body;
const readingOrder = parseReadingOrder(guideIndexRaw, guideRootPath);

const readingOrderIndex = new Map<string, number>(
  readingOrder.map((entry, index) => [entry.href.replace(/\/+$/, ""), index])
);

const guideNavigation = createGuideNavigation(guideEntries, guideRootPath, readingOrderIndex);

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
      ...guideNavigation
    ]
  },
  {
    label: "API",
    children: [
      {
        label: "Introduction",
        href: withBase(apiRootPath)
      },
      ...createApiNavigation(apiEntries, apiPackageEntries, apiRootPath)
    ]
  },
  {
    label: "Examples",
    href: withBase(examplesRootPath)
  }
];

export { sidebarTabs };
