import { getCollection } from "astro:content";
import { withBase } from "../utils/url.js";
import { resolveSiteLink } from "./links.js";
import { getApiEntryRoute, getApiRoutePath, getExamplesRoutePath, getGuideEntryRoute, getGuideRoutePath } from "./site.js";
import { getReflectionKindLabel } from "../utils/typedoc.js";

function cleanLabel(value) {
  return value.replace(/^\s*\d+[.)-]?\s+/, "").trim();
}

function stripGuideOrderPrefix(value) {
  const stripped = value.replace(/^\d+(?:[.)_-]|\s)+/, "");
  return stripped || value;
}

function normalizeGuideNavigationRoute(value, guideRootPath) {
  const withoutExtension = value.replace(/\.md$/, "");
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

function resolveGuideOrderHref(href, guideRootPath) {
  return normalizeGuideNavigationRoute(
    resolveSiteLink(href, { currentPath: `${guideRootPath}/` }),
    guideRootPath
  );
}

function parseReadingOrder(raw, guideRootPath) {
  const entries = [];
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

function getApiBadge(kind) {
  const name = getReflectionKindLabel(kind).toLowerCase();
  return {
    letter: name.charAt(0).toUpperCase(),
    name
  };
}

function formatApiNavigationGroupLabel(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getApiRouteSegments(route, apiRootPath) {
  const prefix = `${apiRootPath}/`;

  if (!route.startsWith(prefix)) {
    throw new Error(`API route "${route}" is outside the configured API route "${apiRootPath}".`);
  }

  return route.slice(prefix.length).split("/").filter(Boolean);
}

function getGuideRouteSegments(route, guideRootPath) {
  const normalizedRoute = normalizeGuideNavigationRoute(route, guideRootPath);
  const prefix = `${guideRootPath}/`;

  if (!normalizedRoute.startsWith(prefix)) {
    throw new Error(`Guide route "${route}" is outside the configured guide route "${guideRootPath}".`);
  }

  return normalizedRoute.slice(prefix.length).split("/").filter(Boolean);
}

function formatGuideNavigationGroupLabel(value) {
  const withoutOrder = value.replace(/^\d+[.)-]?[-_\s]*/, "");
  const formatted = withoutOrder
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim();

  return formatted || value;
}

function createApiNavigation(apiEntries, apiRootPath) {
  const root = {
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

  function renderNode(node) {
    return [...node.children.values()]
      .sort((a, b) => a.segment.localeCompare(b.segment))
      .map((child) => {
        const children = renderNode(child);
        const item = child.entry ?? {
          label: formatApiNavigationGroupLabel(child.segment)
        };

        return children.length > 0 ? { ...item, children } : item;
      });
  }

  return renderNode(root);
}

function createGuideNavigation(guideEntries, guideRootPath, readingOrderIndex) {
  const root = {
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

  function getNodeOrder(node) {
    return [...node.children.values()].reduce(
      (order, child) => Math.min(order, getNodeOrder(child)),
      node.order
    );
  }

  function renderNode(node) {
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
const [introEntries, guideEntries, examplesEntries, apiEntries] = await Promise.all([
  getCollection("intro"),
  getCollection("guide"),
  getCollection("examples"),
  getCollection("api")
]);
const introEntry = introEntries[0];

if (!introEntry) {
  throw new Error("Missing introduction entry");
}

const guideIndexEntry = guideEntries.find((entry) => getGuideEntryRoute(entry) === guideRootPath);

if (!guideIndexEntry) {
  throw new Error("Missing guide index entry");
}

const guideIndexRaw = guideIndexEntry.body;
const readingOrder = parseReadingOrder(guideIndexRaw, guideRootPath);

const readingOrderIndex = new Map(
  readingOrder.map((entry, index) => [entry.href.replace(/\/+$/, ""), index]),
);

const guideNavigation = createGuideNavigation(guideEntries, guideRootPath, readingOrderIndex);

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
      ...createApiNavigation(apiEntries, apiRootPath)
    ]
  },
  {
    label: "Examples",
    href: withBase(examplesRootPath)
  }
];

export { sidebarTabs };
