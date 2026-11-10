import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { projectRootDir } from "./project.js";
import { getMdnTypeUrl } from "../utils/mdn.js";

const linkMapPath = path.join(projectRootDir, ".astro", "link-map.json");

function createLinks() {
  return { __proto__: null };
}

function readLinks() {
  try {
    return Object.assign(createLinks(), JSON.parse(readFileSync(linkMapPath, "utf8")));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return createLinks();
    }

    throw error;
  }
}

function writeLinks(links) {
  mkdirSync(path.dirname(linkMapPath), { recursive: true });
  const temporaryPath = `${linkMapPath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(links, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, linkMapPath);
}

export function clearLinks() {
  writeLinks(createLinks());
}

function normalizeSlashes(value) {
  return value.replace(/\\/g, "/");
}

function getProjectRelativePath(value) {
  if (!path.isAbsolute(value)) {
    return value;
  }

  const relative = path.relative(projectRootDir, value);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return value;
  }

  return relative;
}

function normalizeAlias(value) {
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

export function addLink(alias, route) {
  const key = normalizeAlias(alias);
  if (!key) {
    return;
  }

  const links = readLinks();

  if (!Object.prototype.hasOwnProperty.call(links, key)) {
    links[key] = route;
    writeLinks(links);
    return;
  }

  const previous = links[key];
  if (previous !== route) {
    // An ambiguous source/name alias must not silently link to the wrong page.
    links[key] = null;
  }

  writeLinks(links);
}

function getRegisteredLink(alias, links) {
  const key = normalizeAlias(alias);
  if (!key || !Object.prototype.hasOwnProperty.call(links, key)) {
    return undefined;
  }

  const route = links[key];
  return route === null ? undefined : route;
}

function hasRegisteredLink(alias, links) {
  const key = normalizeAlias(alias);
  return key && Object.prototype.hasOwnProperty.call(links, key);
}

export function getLink(alias) {
  const links = readLinks();
  const route = getRegisteredLink(alias, links);
  if (route) {
    return route;
  }

  if (!hasRegisteredLink(alias, links)) {
    const mdnRoute = getMdnTypeUrl(alias);
    if (mdnRoute) {
      return mdnRoute;
    }
  }

  return undefined;
}
