import {
  getApiPackageRoute,
  getExamplesRoutePath,
  getGuideEntryRoute
} from "./site.js";
import { addLink, addLinks, getLink } from "./link-map.js";

export { addLink, addLinks, getLink };

export function addIntroLinks(entries) {
  const links = [];

  for (const entry of entries) {
    links.push([entry.filePath, "/"]);
  }

  addLinks(links);
}

export function addGuideLinks(entries) {
  const links = [];

  for (const entry of entries) {
    const route = getGuideEntryRoute(entry);
    links.push([entry.filePath, route]);
  }

  addLinks(links);
}

export function addExampleLinks(entries) {
  const links = [];

  for (const entry of entries) {
    const route = getExamplesRoutePath(entry.id);
    links.push([entry.filePath, route]);
  }

  addLinks(links);
}

export function addApiPackageLinks(entries) {
  const links = [];

  for (const entry of entries) {
    if (!entry.filePath) {
      continue;
    }

    const route = getApiPackageRoute(entry);
    links.push([entry.filePath, route]);
  }

  addLinks(links);
}

function splitLink(value) {
  const hashIndex = value.indexOf("#");
  const withoutHash = hashIndex === -1 ? value : value.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : value.slice(hashIndex);
  const queryIndex = withoutHash.indexOf("?");

  return {
    hash,
    pathname: queryIndex === -1 ? withoutHash : withoutHash.slice(0, queryIndex),
    query: queryIndex === -1 ? "" : withoutHash.slice(queryIndex)
  };
}

function isExternalLink(value) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
}

function appendLinkSuffix(route, query, hash) {
  const hashIndex = route.indexOf("#");
  const routePath = hashIndex === -1 ? route : route.slice(0, hashIndex);
  const routeHash = hashIndex === -1 ? "" : route.slice(hashIndex);

  return `${routePath}${query}${hash || routeHash}`;
}

export function resolveSiteLink(value) {
  if (value === "" || isExternalLink(value) || value.startsWith("#")) {
    return value;
  }

  const { hash, pathname, query } = splitLink(value);
  if (!pathname) {
    return value;
  }

  const route = getLink(pathname) ?? pathname;

  return appendLinkSuffix(route, query, hash);
}
