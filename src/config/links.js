import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getApiEntryRoute,
  getApiRoutePath,
  getExamplesContentDir,
  getExamplesRoutePath,
  getGuideContentDir,
  getGuideEntryRoute,
  getGuideRoutePath,
  getIntroContentPath
} from "./site.js";
import { projectRootDir } from "./project.js";
import { addLink, getLink } from "./link-map.js";

export { addLink, getLink };

const knownSourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".md", ".ts", ".tsx"]);

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

function normalizePathValue(value) {
  return String(value ?? "").trim().replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

function getPathVariants(value) {
  const normalized = normalizePathValue(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set([normalized]);
  const extension = path.posix.extname(normalized).toLowerCase();

  if (knownSourceExtensions.has(extension)) {
    variants.add(normalized.slice(0, -extension.length));
  }

  for (const variant of [...variants]) {
    if (variant === "index") {
      variants.add("");
    } else if (variant.endsWith("/index")) {
      variants.add(variant.slice(0, -"/index".length));
    }
  }

  return [...variants];
}

function addPathVariants(value, route, prefixes = []) {
  for (const variant of getPathVariants(value)) {
    const names = variant
      ? [variant, ...prefixes.filter(Boolean).map((prefix) => `${prefix}/${variant}`)]
      : prefixes.filter(Boolean);

    for (const name of names) {
      addLink(name, route);
    }
  }
}

function resolveSourceFilePath(value) {
  if (!value) {
    return null;
  }

  if (value instanceof URL || (typeof value === "string" && /^file:/i.test(value))) {
    try {
      return path.normalize(fileURLToPath(value));
    } catch {
      return null;
    }
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  if (path.isAbsolute(raw)) {
    const normalized = path.normalize(raw);
    const relative = path.relative(projectRootDir, normalized);

    if (relative === "" || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
      return normalized;
    }

    // TypeDoc and the content loader can expose project-relative display paths
    // with a leading slash (for example, "/src/index.js").
    if (raw.startsWith("/") && !raw.startsWith("//")) {
      return path.resolve(projectRootDir, raw.slice(1));
    }

    return normalized;
  }

  return path.resolve(projectRootDir, raw);
}

function addFileAliases(filePath, route, prefixes = []) {
  const absolutePath = resolveSourceFilePath(filePath);
  if (!absolutePath) {
    return;
  }

  addPathVariants(absolutePath, route, prefixes);
  addPathVariants(path.relative(projectRootDir, absolutePath), route, prefixes);
}

function addRouteAlias(route) {
  addLink(route, route);
}

function getEntryPathValues(entry) {
  return [entry?.id, entry?.slug]
    .filter((value) => typeof value === "string" && value.trim() !== "");
}

export function addIntroLink(introEntry) {
  const route = "/";
  addFileAliases(getIntroContentPath(), route);

  for (const value of ["README.md", "README", introEntry?.id]) {
    addPathVariants(value, route);
  }
}

export function addGuideLink(entry) {
  const guidePrefixes = ["guide", getProjectRelativePath(getGuideContentDir())];

  addRouteAlias(getGuideRoutePath());
  addPathVariants("guide", getGuideRoutePath());

  if (!entry) {
    return;
  }

  const route = getGuideEntryRoute(entry);
  addRouteAlias(route);

  for (const value of getEntryPathValues(entry)) {
    addPathVariants(value, route, guidePrefixes);
    const fileName = value.endsWith(".md") ? value : `${value}.md`;
    addFileAliases(path.join(getGuideContentDir(), fileName), route, guidePrefixes);
  }
}

export function addExampleLink(entry) {
  const examplePrefixes = ["examples", getProjectRelativePath(getExamplesContentDir())];

  addRouteAlias(getExamplesRoutePath());
  addPathVariants("examples", getExamplesRoutePath());

  if (!entry) {
    return;
  }

  const route = getExamplesRoutePath(entry.id);
  const value = String(entry.id ?? "");

  addRouteAlias(route);
  addPathVariants(value, route, examplePrefixes);
  addPathVariants(`${value}.js`, route, examplePrefixes);
  addFileAliases(path.join(getExamplesContentDir(), `${value}.js`), route, examplePrefixes);
}

function getReflectionChildren(reflection) {
  return [
    ...(reflection?.children ?? []),
    ...(reflection?.signatures ?? []),
    reflection?.getSignature,
    reflection?.setSignature
  ].filter(Boolean);
}

function addReflectionLinks(reflection, route, seenIds = new Set(), anchor) {
  if (!reflection || (Number.isFinite(reflection.id) && seenIds.has(reflection.id))) {
    return;
  }

  const targetRoute = anchor ? `${route}#${anchor}` : route;

  if (Number.isFinite(reflection.id)) {
    seenIds.add(reflection.id);
    addPathVariants(String(reflection.id), targetRoute);
  }

  const names = [reflection.name, reflection.qualifiedName]
    .filter((value) => typeof value === "string" && value.trim() !== "");

  for (const name of names) {
    addPathVariants(name, targetRoute);
    addPathVariants(`api/${name}`, targetRoute);
  }

  for (const child of getReflectionChildren(reflection)) {
    const childAnchor = anchor ?? `member-${child.id}`;
    addReflectionLinks(child, route, seenIds, childAnchor);
  }
}

export function addApiLink(entry) {
  addRouteAlias(getApiRoutePath());
  addPathVariants("api", getApiRoutePath());

  if (!entry) {
    return;
  }

  const route = getApiEntryRoute(entry);
  addRouteAlias(route);
  addPathVariants(entry.id, route, ["api"]);

  for (const source of [
    entry.filePath,
    entry.data?.filePath,
    ...(entry.data?.sources ?? []).map((item) => item?.fileName)
  ]) {
    addFileAliases(source, route, ["api"]);
  }

  addReflectionLinks(entry.data, route);
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

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function appendLinkSuffix(route, query, hash) {
  const hashIndex = route.indexOf("#");
  const routePath = hashIndex === -1 ? route : route.slice(0, hashIndex);
  const routeHash = hashIndex === -1 ? "" : route.slice(hashIndex);

  return `${routePath}${query}${hash || routeHash}`;
}

function getLinkCandidates(pathname, sourcePath, currentPath) {
  const decodedPathname = decodePath(pathname);
  const candidates = [];
  const sourceFilePath = resolveSourceFilePath(sourcePath);

  if (sourceFilePath && !decodedPathname.startsWith("/")) {
    candidates.push(path.resolve(path.dirname(sourceFilePath), decodedPathname));
  }

  if (currentPath && !decodedPathname.startsWith("/")) {
    try {
      candidates.push(new URL(decodedPathname, `https://docs.invalid${currentPath}`).pathname);
    } catch {
      // Fall through to the raw path alias.
    }
  }

  candidates.push(decodedPathname);
  return candidates;
}

function getFallbackRoutePath(pathname) {
  const cleaned = pathname.replace(/^(?:\.\/|\.\.\/)+/, "");
  return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
}

export function resolveSiteLink(value, { sourcePath, currentPath } = {}) {
  if (typeof value !== "string" || value === "" || isExternalLink(value) || value.startsWith("#")) {
    return value;
  }

  const { hash, pathname, query } = splitLink(value);
  if (!pathname) {
    return value;
  }

  let route;

  for (const candidate of getLinkCandidates(pathname, sourcePath, currentPath)) {
    route = getLink(candidate);
    if (route) {
      break;
    }
  }

  if (!route) {
    route = getFallbackRoutePath(pathname);
  }

  return appendLinkSuffix(route, query, hash);
}
