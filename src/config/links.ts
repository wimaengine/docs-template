import {
  getApiEntryRoute,
  getApiPackageRoute,
  getExamplesRoutePath,
  getGuideEntryRoute
} from "./site.ts";
import type { JSONOutput } from "typedoc";
import type { ContentLinkEntry } from "../types.ts";
import { addLink, addLinks, getLink } from "./link-map.ts";
import { getReflectionMemberAnchor } from "../utils/typedoc.ts";

export { addLink, addLinks, getLink };

export function addIntroLinks(entries: ContentLinkEntry[]): void {
  const links: Array<[string, string]> = [];

  for (const entry of entries) {
    links.push([entry.filePath!, "/"]);
  }

  addLinks(links);
}

export function addGuideLinks(entries: ContentLinkEntry[]): void {
  const links: Array<[string, string]> = [];

  for (const entry of entries) {
    const route = getGuideEntryRoute(entry);
    links.push([entry.filePath!, route]);
  }

  addLinks(links);
}

export function addExampleLinks(entries: ContentLinkEntry[]): void {
  const links: Array<[string, string]> = [];

  for (const entry of entries) {
    const route = getExamplesRoutePath(entry.id);
    links.push([entry.filePath!, route]);
  }

  addLinks(links);
}

export function addApiPackageLinks(entries: ContentLinkEntry[]): void {
  const links: Array<[string, string]> = [];

  for (const entry of entries) {
    if (!entry.filePath) {
      continue;
    }

    const route = getApiPackageRoute(entry);
    links.push([entry.filePath, route]);
  }

  addLinks(links);
}

function getReflectionChildren(reflection: JSONOutput.SomeReflection): JSONOutput.SomeReflection[] {
  if (!("children" in reflection)) {
    return [];
  }

  return reflection.children ?? [];
}

function getReflectionName(reflection: JSONOutput.SomeReflection): string {
  return reflection.name.trim();
}

function addReflectionLinks(
  links: Array<[string, string]>,
  reflection: JSONOutput.SomeReflection | undefined,
  route: string,
  parentNames: string[] = [],
  seenIds: Set<number> = new Set(),
  anchor?: string,
  separator = "#"
): void {
  if (!reflection) {
    return;
  }

  const hasId = Number.isFinite(reflection.id);
  if (hasId) {
    if (seenIds.has(reflection.id)) {
      return;
    }

    seenIds.add(reflection.id);
  }

  const name = getReflectionName(reflection);
  const targetRoute = anchor ? `${route}#${anchor}` : route;

  if (name && parentNames.length === 0) {
    links.push([name, targetRoute]);
  }

  if (name) {
    for (const parentName of parentNames) {
      links.push([`${parentName}${separator}${name}`, targetRoute]);
    }
  }

  const childParentNames = parentNames.length > 0 ? parentNames : name ? [name] : [];

  for (const child of getReflectionChildren(reflection)) {
    const childAnchor = anchor ?? getReflectionMemberAnchor(child);
    const childSeparator = child.flags?.isStatic ? "." : "#";
    addReflectionLinks(links, child, route, childParentNames, seenIds, childAnchor, childSeparator);
  }
}

export function addApiLinks(entries: Array<{ data: JSONOutput.SomeReflection }>): void {
  const links: Array<[string, string]> = [];

  for (const entry of entries) {
    addReflectionLinks(links, entry.data, getApiEntryRoute(entry));
  }

  addLinks(links);
}

function splitLink(value: string): { hash: string; pathname: string; query: string } {
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

function isExternalLink(value: string): boolean {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
}

function appendLinkSuffix(route: string, query: string, hash: string): string {
  const hashIndex = route.indexOf("#");
  const routePath = hashIndex === -1 ? route : route.slice(0, hashIndex);
  const routeHash = hashIndex === -1 ? "" : route.slice(hashIndex);

  return `${routePath}${query}${hash || routeHash}`;
}

export function resolveSiteLink(value: string): string {
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
