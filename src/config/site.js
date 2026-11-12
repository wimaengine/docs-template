import path from "node:path";
import { projectRootDir } from "./project.js";
import { getReflectionCategory, getReflectionKindSlug } from "../utils/typedoc.js";

const websiteConfigRegistryKey = "__WIMA_DOCS_WEBSITE_CONFIG_REGISTRY__";

// Function-valued options cannot cross Astro's JSON config bridge. Keep the
// resolver in the shared process and bridge only the serializable settings.
function getWebsiteConfigRegistry() {
  if (typeof process === "undefined") {
    return null;
  }

  if (!(process[websiteConfigRegistryKey] instanceof Map)) {
    process[websiteConfigRegistryKey] = new Map();
  }

  return process[websiteConfigRegistryKey];
}

function getRegisteredApiEntryRoute() {
  return getWebsiteConfigRegistry()?.get(projectRootDir);
}

function setRegisteredApiEntryRoute(routeResolver) {
  getWebsiteConfigRegistry()?.set(projectRootDir, routeResolver);
}

const defaultThemeColors = Object.freeze({
  background: "#05070a",
  panel: "#0b1118",
  surface: "#101721",
  surfaceRaised: "#151d28",
  text: "#eef2f7",
  muted: "#a8b1bd",
  border: "#243043",
  borderStrong: "#314055",
  accent: "#7dd3fc",
  accentSecondary: "#cbeafe",
  codeBackground: "#090d13",
  codeText: "#f3f4f6"
});

const defaultWebsiteTheme = Object.freeze({
  default: "default",
  schemes: Object.freeze({
    default: Object.freeze({
      colors: defaultThemeColors
    })
  })
});

const themeVariableNames = Object.freeze({
  background: "--bg",
  panel: "--panel",
  surface: "--surface-2",
  surfaceRaised: "--surface-3",
  text: "--text",
  muted: "--muted",
  border: "--border",
  borderStrong: "--border-strong",
  accent: "--accent",
  accentSecondary: "--accent-secondary",
  codeBackground: "--code-bg",
  codeText: "--code-text"
});

function defaultApiEntryRoute(_path, reflection) {
  const kind = getReflectionKindSlug(reflection?.kind);
  const name = reflection?.name ?? "entry";
  return `${kind}/${name}`;
}

const defaultWebsiteConfig = Object.freeze({
  guideRoute: "/guide",
  examplesRoute: "/examples",
  apiRoute: "/api",
  theme: defaultWebsiteTheme,
  apiEntryRoute: defaultApiEntryRoute,
  guideContentDir: "content/guide",
  examplesContentDir: "examples",
  apiSourceDir: "src",
  introContentPath: "README.md"
});

const websiteConfigEnvironmentKey = "ASTRO_DOCS_WEBSITE_CONFIG";

function readEnvironmentWebsiteConfig() {
  if (typeof process === "undefined") {
    return null;
  }

  const raw = process.env[websiteConfigEnvironmentKey];

  if (!raw) {
    return null;
  }

  try {
    const payload = JSON.parse(raw);

    if (payload?.root !== projectRootDir || !payload.config || typeof payload.config !== "object") {
      return null;
    }

    return resolveWebsiteConfig(payload.config, {
      apiEntryRoute: getRegisteredApiEntryRoute()
    });
  } catch {
    return null;
  }
}

let websiteConfig = readEnvironmentWebsiteConfig() ?? resolveWebsiteConfig();

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

function resolveApiEntryRoute(options, registeredApiEntryRoute) {
  if (options.apiEntryRoute !== undefined) {
    if (typeof options.apiEntryRoute !== "function") {
      throw new TypeError("apiEntryRoute must be a function");
    }

    return options.apiEntryRoute;
  }

  return registeredApiEntryRoute ?? defaultWebsiteConfig.apiEntryRoute;
}

function resolveTheme(options = {}) {
  const themeOptions = options.theme ?? {};
  const schemeOptions = themeOptions.schemes ?? {};
  const schemeNames = Object.keys(schemeOptions);
  const names = schemeNames.length > 0 ? schemeNames : Object.keys(defaultWebsiteTheme.schemes);
  const schemes = {};

  for (const name of names) {
    const baseScheme = defaultWebsiteTheme.schemes.default;
    const scheme = schemeOptions[name] ?? {};

    schemes[name] = Object.freeze({
      colors: Object.freeze({
        ...baseScheme.colors,
        ...(scheme.colors ?? {})
      })
    });
  }

  const requestedDefault = themeOptions.default ?? defaultWebsiteTheme.default;
  const supportsSystemTheme = names.includes("dark") && names.includes("light");
  const defaultScheme = requestedDefault === "auto" && supportsSystemTheme
    ? "auto"
    : schemes[requestedDefault]
      ? requestedDefault
      : names[0];

  return Object.freeze({
    default: defaultScheme,
    schemes: Object.freeze(schemes)
  });
}

function resolveWebsiteConfig(options = {}, { apiEntryRoute: registeredApiEntryRoute } = {}) {
  const config = {
    guideRoute: normalizeRoutePath(options.guideRoute, defaultWebsiteConfig.guideRoute),
    examplesRoute: normalizeRoutePath(options.examplesRoute, defaultWebsiteConfig.examplesRoute),
    apiRoute: normalizeRoutePath(options.apiRoute, defaultWebsiteConfig.apiRoute),
    theme: resolveTheme(options),
    apiEntryRoute: resolveApiEntryRoute(options, registeredApiEntryRoute),
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

function getThemeRule(selector, scheme, indent = "") {
  const variables = Object.entries(scheme.colors)
    .map(([colorName, value]) => `${indent}  ${themeVariableNames[colorName]}: ${value};`)
    .join("\n");

  return `${indent}${selector} {\n${variables}\n${indent}}`;
}

function getWebsiteThemeStyles(theme) {
  const supportsSystemTheme = theme.default === "auto" &&
    theme.schemes.dark &&
    theme.schemes.light;
  const fallbackSchemeName = supportsSystemTheme ? "dark" : theme.default;
  const schemeStyles = Object.entries(theme.schemes).map(([name, scheme]) => {
    const selector = name === fallbackSchemeName
      ? `:root,\n:root[data-theme="${name}"]`
      : `:root[data-theme="${name}"]`;

    return getThemeRule(selector, scheme);
  });

  if (!supportsSystemTheme) {
    return schemeStyles.join("\n\n");
  }

  schemeStyles.push(
    `@media (prefers-color-scheme: dark) {\n${getThemeRule(':root[data-theme="auto"]', theme.schemes.dark, "  ")}\n}`,
    `@media (prefers-color-scheme: light) {\n${getThemeRule(':root[data-theme="auto"]', theme.schemes.light, "  ")}\n}`
  );

  return schemeStyles.join("\n\n");
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

function getWebsiteConfig() {
  // Astro evaluates astro.config.* and src/content.config.* in separate
  // module contexts. Re-read the integration config through the process
  // environment so both contexts observe the same paths.
  websiteConfig = readEnvironmentWebsiteConfig() ?? websiteConfig;
  return websiteConfig;
}

function setWebsiteConfig(options = {}) {
  websiteConfig = resolveWebsiteConfig(options);
  setRegisteredApiEntryRoute(websiteConfig.apiEntryRoute);

  if (typeof process !== "undefined") {
    const { apiEntryRoute: _apiEntryRoute, ...serializableConfig } = websiteConfig;
    process.env[websiteConfigEnvironmentKey] = JSON.stringify({
      root: projectRootDir,
      config: serializableConfig
    });
  }

  return websiteConfig;
}

function getGuideRoutePath(...segments) {
  return joinRoutePath(getWebsiteConfig().guideRoute, ...segments);
}

function stripGuideOrderPrefix(value) {
  const stripped = value.replace(/^\d+(?:[.)_-]|\s)+/, "");
  return stripped || value;
}

function getGuideEntryRoute(entry) {
  const raw = entry.slug ?? entry.id;
  const cleaned = raw.replace(/\.[^/.]+$/, "");

  if (cleaned === "index") {
    return getGuideRoutePath();
  }

  const segments = cleaned
    .split("/")
    .filter(Boolean)
    .map(stripGuideOrderPrefix);

  return getGuideRoutePath(...segments);
}

function getExamplesRoutePath(...segments) {
  return joinRoutePath(getWebsiteConfig().examplesRoute, ...segments);
}

function getApiRoutePath(...segments) {
  return joinRoutePath(getWebsiteConfig().apiRoute, ...segments);
}

function getApiPackageId(entry) {
  const raw = String(entry?.id ?? "")
    .replace(/\.(?:md|mdx)$/i, "")
    .replace(/\/README$/i, "");

  return raw.split("/").filter(Boolean).join("/");
}

function getApiPackageRoute(entry) {
  const packageId = getApiPackageId(entry);

  if (!packageId) {
    throw new Error(`API package entry "${entry?.id ?? ""}" did not produce a package route.`);
  }

  return getApiRoutePath(packageId);
}

function getApiEntryRouteContext(entry) {
  return {
    path: entry.id,
    reflection: entry.data,
    category: getReflectionCategory(entry.data)
  };
}

function getApiEntryRoute(entry) {
  const { path: entryPath, reflection, category } = getApiEntryRouteContext(entry);
  const relativePath = getWebsiteConfig().apiEntryRoute(entryPath, reflection, category);

  if (typeof relativePath !== "string" || relativePath.trim() === "") {
    throw new TypeError("apiEntryRoute must return a non-empty relative path");
  }

  const normalizedPath = relativePath.trim();
  const pathSegments = normalizedPath.split("/").filter(Boolean);

  if (
    normalizedPath.startsWith("/") ||
    /^[a-z][a-z\d+.-]*:/i.test(normalizedPath) ||
    normalizedPath.includes("?") ||
    normalizedPath.includes("#") ||
    pathSegments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("apiEntryRoute must return a relative path without a scheme, query, hash, or dot segments");
  }

  return getApiRoutePath(normalizedPath);
}

function assertUniqueApiEntryRoutes(entries) {
  const routes = new Map();

  for (const entry of entries) {
    const route = getApiEntryRoute(entry);
    const previous = routes.get(route);

    if (previous) {
      throw new Error(
        `API route collision: "${route}" is used by "${previous.id}" and "${entry.id}".`
      );
    }

    routes.set(route, entry);
  }
}

function getGuideContentDir() {
  return getWebsiteConfig().guideContentDir;
}

function getExamplesContentDir() {
  return getWebsiteConfig().examplesContentDir;
}

function getApiSourceDir() {
  return getWebsiteConfig().apiSourceDir;
}

function getIntroContentPath() {
  return getWebsiteConfig().introContentPath;
}

export {
  defaultWebsiteConfig,
  assertUniqueApiEntryRoutes,
  getApiPackageId,
  getApiPackageRoute,
  getApiRoutePath,
  getApiEntryRoute,
  getApiEntryRouteContext,
  getApiSourceDir,
  getExamplesContentDir,
  getExamplesRoutePath,
  getGuideEntryRoute,
  getGuideContentDir,
  getGuideRoutePath,
  getIntroContentPath,
  getWebsiteConfig,
  getWebsiteThemeStyles,
  joinRoutePath,
  resolveWebsiteConfig,
  routeToParam,
  setWebsiteConfig
};
