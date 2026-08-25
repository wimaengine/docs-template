import path from "node:path";
import { projectRootDir } from "./project.js";

const defaultWebsiteConfig = Object.freeze({
  guideRoute: "/guide",
  examplesRoute: "/examples",
  apiRoute: "/api",
  guideContentDir: "content/guide",
  examplesContentDir: "examples",
  apiSourceDir: "src",
  introContentPath: "README.md"
});

let websiteConfig = resolveWebsiteConfig();

function normalizeRoutePath(value, fallback) {
  const raw = typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = prefixed.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function normalizeContentPath(value, fallback) {
  const raw = typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(projectRootDir, raw);
}

function resolveWebsiteConfig(options = {}) {
  const config = {
    guideRoute: normalizeRoutePath(options.guideRoute, defaultWebsiteConfig.guideRoute),
    examplesRoute: normalizeRoutePath(options.examplesRoute, defaultWebsiteConfig.examplesRoute),
    apiRoute: normalizeRoutePath(options.apiRoute, defaultWebsiteConfig.apiRoute),
    guideContentDir: normalizeContentPath(options.guideContentDir, defaultWebsiteConfig.guideContentDir),
    examplesContentDir: normalizeContentPath(options.examplesContentDir, defaultWebsiteConfig.examplesContentDir),
    apiSourceDir: normalizeContentPath(options.apiSourceDir, defaultWebsiteConfig.apiSourceDir),
    introContentPath: normalizeContentPath(options.introContentPath, defaultWebsiteConfig.introContentPath)
  };

  if (config.guideRoute === "/" || config.examplesRoute === "/" || config.apiRoute === "/") {
    throw new Error("guideRoute, examplesRoute, and apiRoute must not point at the site root");
  }

  if (config.guideRoute === config.examplesRoute || config.guideRoute === config.apiRoute || config.examplesRoute === config.apiRoute) {
    throw new Error("guideRoute, examplesRoute, and apiRoute must be different");
  }

  return Object.freeze(config);
}

function joinRoutePath(...segments) {
  const parts = [];

  for (const segment of segments) {
    if (typeof segment !== "string" || segment.trim() === "") {
      continue;
    }

    parts.push(...segment.split("/").filter(Boolean));
  }

  return `/${parts.join("/")}`;
}

function routeToParam(value) {
  return normalizeRoutePath(value, "/").replace(/^\/+/, "");
}

function splitUrl(value) {
  const [withoutHash, hash = ""] = value.split("#", 2);
  const [pathname, query = ""] = withoutHash.split("?", 2);
  return {
    hash,
    pathname,
    query
  };
}

function rewriteRoutePrefix(pathname) {
  if (pathname === "/guide" || pathname.startsWith("/guide/")) {
    return getGuideRoutePath(pathname.slice("/guide".length));
  }

  if (pathname === "/examples" || pathname.startsWith("/examples/")) {
    return getExamplesRoutePath(pathname.slice("/examples".length));
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return getApiRoutePath(pathname.slice("/api".length));
  }

  return pathname;
}

function rewriteSiteRoute(value) {
  const { hash, pathname, query } = splitUrl(value);
  const rewrittenPathname = rewriteRoutePrefix(pathname);

  return `${rewrittenPathname}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}

function getWebsiteConfig() {
  return websiteConfig;
}

function setWebsiteConfig(options = {}) {
  websiteConfig = resolveWebsiteConfig(options);
  return websiteConfig;
}

function getGuideRoutePath(...segments) {
  return joinRoutePath(websiteConfig.guideRoute, ...segments);
}

function getExamplesRoutePath(...segments) {
  return joinRoutePath(websiteConfig.examplesRoute, ...segments);
}

function getApiRoutePath(...segments) {
  return joinRoutePath(websiteConfig.apiRoute, ...segments);
}

function getGuideContentDir() {
  return websiteConfig.guideContentDir;
}

function getExamplesContentDir() {
  return websiteConfig.examplesContentDir;
}

function getApiSourceDir() {
  return websiteConfig.apiSourceDir;
}

function getIntroContentPath() {
  return websiteConfig.introContentPath;
}

export {
  defaultWebsiteConfig,
  getApiRoutePath,
  getApiSourceDir,
  getExamplesContentDir,
  getExamplesRoutePath,
  getGuideContentDir,
  getGuideRoutePath,
  getIntroContentPath,
  getWebsiteConfig,
  joinRoutePath,
  resolveWebsiteConfig,
  rewriteSiteRoute,
  routeToParam,
  setWebsiteConfig
};
