import path from "node:path";
import { projectRootDir } from "./project.js";
import { getMdnTypeUrl } from "../utils/mdn.js";

const links = { __proto__: null };

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
  if (typeof value !== "string") {
    return "";
  }

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

function isExternalLink(value) {
  return /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value);
}

export function addLink(alias, route) {
  const key = normalizeAlias(alias);
  if (!key || typeof route !== "string") {
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(links, key)) {
    links[key] = route;
    return;
  }

  const previous = links[key];
  if (previous !== route) {
    // An ambiguous source/name alias must not silently link to the wrong page.
    links[key] = null;
  }
}

function getRegisteredLink(alias) {
  const key = normalizeAlias(alias);
  if (!key || !Object.prototype.hasOwnProperty.call(links, key)) {
    return undefined;
  }

  const route = links[key];
  return route === null ? undefined : route;
}

function hasRegisteredLink(alias) {
  const key = normalizeAlias(alias);
  return Boolean(key) && Object.prototype.hasOwnProperty.call(links, key);
}

export function getLink(alias, basePath) {
  const candidates = [alias];

  if (
    typeof alias === "string" &&
    typeof basePath === "string" &&
    basePath !== "" &&
    !alias.startsWith("/") &&
    !isExternalLink(alias)
  ) {
    try {
      const base = basePath.endsWith("/") ? basePath : `${basePath}/`;
      candidates.unshift(new URL(alias, `https://docs.invalid${base}`).pathname);
    } catch {
      // Fall through to the direct alias lookup.
    }
  }

  for (const candidate of candidates) {
    const route = getRegisteredLink(candidate);
    if (route) {
      return route;
    }
  }

  for (const candidate of candidates) {
    if (hasRegisteredLink(candidate)) {
      continue;
    }

    const mdnRoute = getMdnTypeUrl(candidate);
    if (mdnRoute) {
      return mdnRoute;
    }
  }

  return undefined;
}
