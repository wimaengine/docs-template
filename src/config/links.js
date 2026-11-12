import {
  getApiPackageRoute,
  getApiEntryRoute,
  getExamplesRoutePath,
  getGuideEntryRoute,
  getGuideRoutePath
} from "./site.js";
import { addLink, getLink } from "./link-map.js";

export { addLink, getLink };

export function addIntroLink(entry) {
  addLink(entry.id, "/");
}

export function addGuideLink(entry) {
  addLink(getGuideRoutePath(entry.id), getGuideEntryRoute(entry));
}

export function addExampleLink(entry) {
  const route = getExamplesRoutePath(entry.id);
  addLink(route, route);
}

export function addApiLink(entry) {
  addLink(entry.data.name, getApiEntryRoute(entry));
}

export function addApiPackageLink(entry) {
  const route = getApiPackageRoute(entry);

  if (!entry.filePath) {
    return;
  }

  addLink(entry.filePath, route);
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
