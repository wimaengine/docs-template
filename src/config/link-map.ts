import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { projectRootDir } from "./project.ts";
import { mdnTypeLinks } from "../utils/mdn.ts";

type LinkMap = Record<string, string | null>;
export type LinkEntry = [alias: string, route: string];

const linkMapPath = path.join(projectRootDir, ".astro", "link-map.json");

function createLinks(): LinkMap {
  return { __proto__: null } as LinkMap;
}

function readLinks(): LinkMap {
  try {
    const links = JSON.parse(readFileSync(linkMapPath, "utf8")) as LinkMap;
    return Object.assign(createLinks(), links);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return createLinks();
    }

    throw error;
  }
}

function writeLinks(links: LinkMap): void {
  mkdirSync(path.dirname(linkMapPath), { recursive: true });
  const temporaryPath = `${linkMapPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(links, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, linkMapPath);
}

export function clearLinks(initialLinks: LinkMap = {}): void {
  writeLinks(Object.assign(createLinks(), initialLinks));
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

function getProjectRelativePath(value: string): string {
  if (!path.isAbsolute(value)) {
    return value;
  }

  const relative = path.relative(projectRootDir, value);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return value;
  }

  return relative;
}

function normalizeAlias(value: string): string {
  let alias = normalizeSlashes(value.trim());
  if (!alias) {
    return "";
  }

  alias = normalizeSlashes(getProjectRelativePath(path.normalize(alias)));
  alias = alias
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");

  return alias === "." ? "" : alias;
}

export function addLinks(entries: LinkEntry[] = []): void {
  const links = readLinks();

  for (const [alias, route] of entries) {
    const key = normalizeAlias(alias);
    if (!key) {
      continue;
    }

    if (!Object.prototype.hasOwnProperty.call(links, key)) {
      links[key] = route;
      continue;
    }

    const previous = links[key];
    if (previous !== route && previous !== null) {
      // An ambiguous source/name alias must not silently link to the wrong page.
      links[key] = null;
    }
  }

  writeLinks(links);
}

export function addLink(alias: string, route: string): void {
  addLinks([[alias, route]]);
}

function getRegisteredLink(alias: string, links: LinkMap): string | undefined {
  const key = normalizeAlias(alias);
  if (!key || !Object.prototype.hasOwnProperty.call(links, key)) {
    return undefined;
  }

  const route = links[key];
  return route === null ? undefined : route;
}

export function getLink(alias: string): string | undefined {
  const links = readLinks();
  const route = getRegisteredLink(alias, links);
  return route ?? mdnTypeLinks[alias];
}
