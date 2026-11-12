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

function getProjectRelativePath(filePath) {
  const relativePath = path.relative(projectRootDir, filePath);

  if (
    relativePath === "" ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return undefined;
  }

  return relativePath.split(path.sep).join("/");
}

function getGuideRouteTargetPath(pathname, sourceFilePath) {
  const guideDirectory = path.resolve(getGuideContentDir());
  const directTargetPath = path.resolve(path.dirname(sourceFilePath), decodeURIComponent(pathname));

  if (isInsideDirectory(guideDirectory, directTargetPath)) {
    return directTargetPath;
  }

  const routePrefix = getGuideRoutePath().replace(/^\/+|\/+$/g, "");
  const normalizedPathname = decodeURIComponent(pathname)
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");

  if (
    routePrefix &&
    (normalizedPathname === routePrefix || normalizedPathname.startsWith(`${routePrefix}/`))
  ) {
    const relativePath = normalizedPathname.slice(routePrefix.length).replace(/^\/+/, "");
    return path.resolve(guideDirectory, relativePath);
  }

  return directTargetPath;
}

function getIntroTargetRoute(targetFilePath) {
  const targetPath = getProjectRelativePath(targetFilePath);
  return targetPath ? getLink(targetPath) : undefined;
}

function resolveProjectLink(value, sourcePath) {
  if (!sourcePath || value === "" || value.startsWith("#")) {
    return resolveSiteLink(value);
  }

  const { hash, pathname, query } = splitLink(value);
  if (!pathname || pathname.startsWith("/")) {
    return resolveSiteLink(value);
  }

  const sourceFilePath = resolveSourcePath(sourcePath);
  const targetFilePath = path.resolve(path.dirname(sourceFilePath), decodeURIComponent(pathname));
  const targetPath = getProjectRelativePath(targetFilePath);
  const route = targetPath ? getLink(targetPath) : undefined;

  return route ? appendLinkSuffix(route, query, hash) : resolveSiteLink(value);
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
    return resolveProjectLink(value, sourcePath);
  }

  const targetFilePath = getGuideRouteTargetPath(pathname, sourceFilePath);
  const route = getIntroTargetRoute(targetFilePath);

  return route ? appendLinkSuffix(route, query, hash) : resolveProjectLink(value, sourcePath);
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

  const targetPath = getProjectRelativePath(targetFilePath);
  const exactRoute = targetPath ? getLink(targetPath) : undefined;

  if (exactRoute) {
    return appendLinkSuffix(exactRoute, query, hash);
  }

  return resolveSiteLink(value);
}
