import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGuideContentDir, getGuideRoutePath } from "../config/site.js";
import { getLink } from "../config/link-map.js";
import { projectRootDir } from "../config/project.js";
import { resolveSiteLink } from "../config/links.js";

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

function appendLinkSuffix(route, query, hash) {
  const hashIndex = route.indexOf("#");
  const routePath = hashIndex === -1 ? route : route.slice(0, hashIndex);
  const routeHash = hashIndex === -1 ? "" : route.slice(hashIndex);

  return `${routePath}${query}${hash || routeHash}`;
}

function resolveSourcePath(sourcePath) {
  if (sourcePath instanceof URL) {
    return fileURLToPath(sourcePath);
  }

  return path.isAbsolute(sourcePath)
    ? path.normalize(sourcePath)
    : path.resolve(projectRootDir, sourcePath);
}

function isInsideDirectory(directory, value) {
  const relative = path.relative(directory, value);
  return relative !== "" && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function slugifyGuideSegment(value) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_ -]/gu, "")
    .replace(/ /g, "-");
}

function getGuideEntryId(relativePath) {
  const withoutExtension = relativePath.replace(/\.[^/.]+$/, "");
  const segments = withoutExtension
    .split("/")
    .filter(Boolean)
    .map(slugifyGuideSegment);
  const id = segments.join("/");

  return id.endsWith("/index") ? id.slice(0, -"/index".length) : id;
}

export function resolveGuideLink(value, sourcePath) {
  if (!sourcePath || value === "" || value.startsWith("#")) {
    return resolveSiteLink(value);
  }

  const { hash, pathname, query } = splitLink(value);
  if (!pathname || pathname.startsWith("/")) {
    return resolveSiteLink(value);
  }

  const guideDirectory = path.resolve(getGuideContentDir());
  const sourceFilePath = resolveSourcePath(sourcePath);
  const targetFilePath = path.resolve(path.dirname(sourceFilePath), decodeURIComponent(pathname));

  if (!isInsideDirectory(guideDirectory, sourceFilePath) || !isInsideDirectory(guideDirectory, targetFilePath)) {
    return resolveSiteLink(value);
  }

  const guideRelativePath = path.relative(guideDirectory, targetFilePath).split(path.sep).join("/");
  const guideEntryId = getGuideEntryId(guideRelativePath);
  const route = getLink(getGuideRoutePath(guideEntryId));

  return route ? appendLinkSuffix(route, query, hash) : resolveSiteLink(value);
}
