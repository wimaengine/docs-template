import path from "node:path";
import { fileURLToPath } from "node:url";
import { getGuideContentDir, getGuideRoutePath, getIntroContentPath } from "../config/site.js";
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

function getProjectRelativeAlias(filePath) {
  const relativePath = path.relative(projectRootDir, filePath);

  if (
    relativePath === "" ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }

  return relativePath
    .split(path.sep)
    .join("/")
    .replace(/\.[^/.]+$/, "")
    .replace(/\/index$/, "");
}

function getIntroTargetRoute(targetFilePath) {
  const guideDirectory = path.resolve(getGuideContentDir());

  if (isInsideDirectory(guideDirectory, targetFilePath)) {
    const guideRelativePath = path.relative(guideDirectory, targetFilePath).split(path.sep).join("/");
    const guideEntryId = getGuideEntryId(guideRelativePath);
    const guideAlias = getGuideRoutePath(guideEntryId);
    return getLink(guideAlias) ?? getLink(`${guideAlias}/index`);
  }

  const alias = getProjectRelativeAlias(targetFilePath);
  return alias ? getLink(alias) ?? getLink(`${alias}/index`) : undefined;
}

function resolveIntroLink(value, sourcePath) {
  if (!sourcePath || value === "" || value.startsWith("#")) {
    return resolveSiteLink(value);
  }

  const { hash, pathname, query } = splitLink(value);
  if (!pathname || pathname.startsWith("/")) {
    return resolveSiteLink(value);
  }

  const sourceFilePath = resolveSourcePath(sourcePath);
  const introFilePath = path.resolve(getIntroContentPath());

  if (sourceFilePath !== introFilePath) {
    return resolveSiteLink(value);
  }

  const targetFilePath = path.resolve(path.dirname(sourceFilePath), decodeURIComponent(pathname));
  const route = getIntroTargetRoute(targetFilePath);

  return route ? appendLinkSuffix(route, query, hash) : resolveSiteLink(value);
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
    return resolveIntroLink(value, sourcePath);
  }

  const guideRelativePath = path.relative(guideDirectory, targetFilePath).split(path.sep).join("/");
  const guideEntryId = getGuideEntryId(guideRelativePath);
  const route = getLink(getGuideRoutePath(guideEntryId));

  return route ? appendLinkSuffix(route, query, hash) : resolveSiteLink(value);
}
