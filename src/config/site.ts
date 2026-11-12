import path from "node:path";
import { projectRootDir, rootPackageName } from "./project.ts";
import type { JSONOutput } from "typedoc";
import { getReflectionCategory, getReflectionKindSlug } from "../utils/typedoc.ts";

export interface WebsiteConfigOptions {
  seo?: WebsiteSeoOptions;
  guideRoute?: string;
  examplesRoute?: string;
  apiRoute?: string;
  sourceBranch?: string;
  theme?: WebsiteThemeOptions;
  apiEntryRoute?: ApiEntryRouteResolver;
  guideContentDir?: string;
  examplesContentDir?: string;
  apiSourceDir?: string;
  introContentPath?: string;
}

export interface WebsiteSeoImageOptions {
  src: string;
  alt?: string;
}

export interface WebsiteThemeLogoOptions {
  src: string;
  alt: string;
}

export interface WebsiteSeoOptions {
  siteName?: string;
  siteDescription?: string;
  locale?: string;
  twitterHandle?: string;
  socialImage?: WebsiteSeoImageOptions;
  manifest?: string;
}

export interface WebsiteThemeColors {
  background: `#${string}`;
  panel: `#${string}`;
  surface: `#${string}`;
  surfaceRaised: `#${string}`;
  text: `#${string}`;
  muted: `#${string}`;
  border: `#${string}`;
  borderStrong: `#${string}`;
  accent: `#${string}`;
  accentSecondary: `#${string}`;
  codeBackground: `#${string}`;
  codeText: `#${string}`;
}

export interface WebsiteThemeSchemeOptions {
  logo?: WebsiteThemeLogoOptions;
  favicon?: string;
  appleTouchIcon?: string;
  maskIcon?: string;
  maskIconColor?: string;
  colors?: Partial<WebsiteThemeColors>;
}

export interface WebsiteThemeOptions {
  default?: string;
  schemes?: Record<string, WebsiteThemeSchemeOptions>;
}

export interface WebsiteThemeScheme {
  logo?: WebsiteThemeLogoOptions;
  favicon?: string;
  appleTouchIcon?: string;
  maskIcon?: string;
  maskIconColor?: string;
  colors: WebsiteThemeColors;
}

export interface WebsiteTheme {
  default: string;
  schemes: Record<string, WebsiteThemeScheme>;
}

export interface ApiRouteEntry {
  id: string;
  data: JSONOutput.DeclarationReflection;
}

export interface ApiPackageRouteEntry {
  id: string;
  data?: {
    title?: string;
  };
  filePath?: string;
}

export interface ApiEntryRouteContext {
  path: string;
  reflection: JSONOutput.DeclarationReflection;
  category: string | undefined;
}

export type ApiEntryRouteResolver = (
  path: string,
  reflection: JSONOutput.DeclarationReflection,
  category: string | undefined
) => string;

export interface WebsiteConfig {
  seo: {
    siteName: string;
    siteDescription: string;
    locale: string;
    twitterHandle?: string;
    socialImage?: WebsiteSeoImageOptions;
    manifest?: string;
  };
  guideRoute: string;
  examplesRoute: string;
  apiRoute: string;
  sourceBranch: string;
  theme: WebsiteTheme;
  apiEntryRoute: ApiEntryRouteResolver;
  guideContentDir: string;
  examplesContentDir: string;
  apiSourceDir: string;
  introContentPath: string;
}

const websiteConfigRegistryKey = "__WIMA_DOCS_WEBSITE_CONFIG_REGISTRY__";

// Function-valued options cannot cross Astro's JSON config bridge. Keep the
// resolver in the shared process and bridge only the serializable settings.
function getWebsiteConfigRegistry(): Map<string, ApiEntryRouteResolver> | null {
  if (typeof process === "undefined") {
    return null;
  }

  type ProcessWithConfigRegistry = typeof process & {
    [websiteConfigRegistryKey]?: Map<string, ApiEntryRouteResolver>;
  };
  const runtimeProcess = process as ProcessWithConfigRegistry;

  if (!(runtimeProcess[websiteConfigRegistryKey] instanceof Map)) {
    runtimeProcess[websiteConfigRegistryKey] = new Map<string, ApiEntryRouteResolver>();
  }

  return runtimeProcess[websiteConfigRegistryKey] as Map<string, ApiEntryRouteResolver>;
}

function getRegisteredApiEntryRoute(): ApiEntryRouteResolver | undefined {
  return getWebsiteConfigRegistry()?.get(projectRootDir);
}

function setRegisteredApiEntryRoute(routeResolver: ApiEntryRouteResolver): void {
  getWebsiteConfigRegistry()?.set(projectRootDir, routeResolver);
}

const defaultThemeColors: WebsiteThemeColors = Object.freeze({
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
}) as WebsiteThemeColors;

const defaultWebsiteTheme: WebsiteTheme = Object.freeze({
  default: "default",
  schemes: Object.freeze({
    default: Object.freeze({
      colors: defaultThemeColors
    })
  })
}) as WebsiteTheme;

const themeVariableNames: Record<keyof WebsiteThemeColors, string> = Object.freeze({
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

function defaultApiEntryRoute(_path: string, reflection: JSONOutput.DeclarationReflection): string {
  const kind = getReflectionKindSlug(reflection.kind);
  const name = reflection.name || "entry";
  return `${kind}/${name}`;
}

const defaultWebsiteConfig: Readonly<WebsiteConfig> = Object.freeze({
  seo: {
    siteName: rootPackageName,
    siteDescription: `${rootPackageName} documentation`,
    locale: "en"
  },
  guideRoute: "/guide",
  examplesRoute: "/examples",
  apiRoute: "/api",
  sourceBranch: "main",
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
    const payload = JSON.parse(raw) as {
      root: string;
      config: WebsiteConfigOptions;
    };

    if (payload.root !== projectRootDir) {
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

function normalizeRoutePath(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  const prefixed = raw.startsWith("/") ? raw : `/${raw}`;
  const normalized = prefixed.replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

function normalizeContentPath(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  return path.isAbsolute(raw) ? path.normalize(raw) : path.resolve(projectRootDir, raw);
}

function normalizeSourceBranch(value: string | undefined, fallback: string): string {
  const raw = value?.trim() || fallback;
  return raw.replace(/^\/+|\/+$/g, "") || fallback;
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function resolveSeo(options: WebsiteSeoOptions = {}): WebsiteConfig["seo"] {
  return {
    siteName: options.siteName?.trim() || defaultWebsiteConfig.seo.siteName,
    siteDescription: options.siteDescription?.trim() || defaultWebsiteConfig.seo.siteDescription,
    locale: options.locale?.trim() || defaultWebsiteConfig.seo.locale,
    twitterHandle: normalizeOptionalText(options.twitterHandle),
    socialImage: options.socialImage
      ? {
          src: options.socialImage.src.trim(),
          alt: normalizeOptionalText(options.socialImage.alt)
        }
      : undefined,
    manifest: normalizeOptionalText(options.manifest)
  };
}

function resolveApiEntryRoute(
  options: WebsiteConfigOptions,
  registeredApiEntryRoute?: ApiEntryRouteResolver
): ApiEntryRouteResolver {
  return options.apiEntryRoute ?? registeredApiEntryRoute ?? defaultWebsiteConfig.apiEntryRoute;
}

function resolveTheme(options: WebsiteThemeOptions = {}): WebsiteTheme {
  const themeOptions = options.theme ?? {};
  const schemeOptions = themeOptions.schemes ?? {};
  const schemeNames = Object.keys(schemeOptions);
  const names = schemeNames.length > 0 ? schemeNames : Object.keys(defaultWebsiteTheme.schemes);
  const schemes: Record<string, WebsiteThemeScheme> = {};

  for (const name of names) {
    const baseScheme = defaultWebsiteTheme.schemes.default;
    const scheme = schemeOptions[name] ?? {};

    schemes[name] = Object.freeze({
      logo: scheme.logo
        ? {
            src: scheme.logo.src.trim(),
            alt: scheme.logo.alt.trim()
          }
        : undefined,
      favicon: normalizeOptionalText(scheme.favicon),
      appleTouchIcon: normalizeOptionalText(scheme.appleTouchIcon),
      maskIcon: normalizeOptionalText(scheme.maskIcon),
      maskIconColor: normalizeOptionalText(scheme.maskIconColor),
      colors: Object.freeze({
        ...baseScheme.colors,
        ...(scheme.colors ?? {})
      }) as WebsiteThemeColors
    }) as WebsiteThemeScheme;
  }

  const requestedDefault = themeOptions.default ?? defaultWebsiteTheme.default;
  const supportsSystemTheme = names.includes("dark") && names.includes("light");
  const defaultScheme = requestedDefault === "auto" && supportsSystemTheme
    ? "auto"
    : schemes[requestedDefault]
      ? requestedDefault
      : names[0] ?? defaultWebsiteTheme.default;

  return Object.freeze({
    default: defaultScheme,
    schemes: Object.freeze(schemes)
  });
}

function resolveWebsiteConfig(
  options: WebsiteConfigOptions = {},
  { apiEntryRoute: registeredApiEntryRoute }: { apiEntryRoute?: ApiEntryRouteResolver } = {}
): WebsiteConfig {
  const config = {
    seo: resolveSeo(options.seo),
    guideRoute: normalizeRoutePath(options.guideRoute, defaultWebsiteConfig.guideRoute),
    examplesRoute: normalizeRoutePath(options.examplesRoute, defaultWebsiteConfig.examplesRoute),
    apiRoute: normalizeRoutePath(options.apiRoute, defaultWebsiteConfig.apiRoute),
    sourceBranch: normalizeSourceBranch(options.sourceBranch, defaultWebsiteConfig.sourceBranch),
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

function getThemeRule(selector: string, scheme: WebsiteThemeScheme, indent = ""): string {
  const variables = (Object.entries(scheme.colors) as Array<[
    keyof WebsiteThemeColors,
    WebsiteThemeColors[keyof WebsiteThemeColors]
  ]>)
    .map(([colorName, value]) => (
      `${indent}  ${themeVariableNames[colorName]}: ${value};`
    ))
    .join("\n");

  return `${indent}${selector} {\n${variables}\n${indent}}`;
}

function getWebsiteThemeStyles(theme: WebsiteTheme): string {
  const darkScheme = theme.schemes.dark;
  const lightScheme = theme.schemes.light;
  const supportsSystemTheme = theme.default === "auto" &&
    darkScheme !== undefined &&
    lightScheme !== undefined;
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
    `@media (prefers-color-scheme: dark) {\n${getThemeRule(':root[data-theme="auto"]', darkScheme, "  ")}\n}`,
    `@media (prefers-color-scheme: light) {\n${getThemeRule(':root[data-theme="auto"]', lightScheme, "  ")}\n}`
  );

  return schemeStyles.join("\n\n");
}

function joinRoutePath(...segments: string[]): string {
  const parts: string[] = [];

  for (const segment of segments) {
    if (segment.trim() === "") {
      continue;
    }

    parts.push(...segment.split("/").filter(Boolean));
  }

  return `/${parts.join("/")}`;
}

function routeToParam(value: string): string {
  return normalizeRoutePath(value, "/").replace(/^\/+/, "");
}

function getWebsiteConfig(): WebsiteConfig {
  // Astro evaluates astro.config.* and src/content.config.* in separate
  // module contexts. Re-read the integration config through the process
  // environment so both contexts observe the same paths.
  websiteConfig = readEnvironmentWebsiteConfig() ?? websiteConfig;
  return websiteConfig;
}

function setWebsiteConfig(options: WebsiteConfigOptions = {}): WebsiteConfig {
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

function getGuideRoutePath(...segments: string[]): string {
  return joinRoutePath(getWebsiteConfig().guideRoute, ...segments);
}

function stripGuideOrderPrefix(value: string): string {
  const stripped = value.replace(/^\d+(?:[.)_-]|\s)+/, "");
  return stripped || value;
}

function getGuideEntryRoute(entry: { id: string; slug?: string }): string {
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

function getExamplesRoutePath(...segments: string[]): string {
  return joinRoutePath(getWebsiteConfig().examplesRoute, ...segments);
}

function getApiRoutePath(...segments: string[]): string {
  return joinRoutePath(getWebsiteConfig().apiRoute, ...segments);
}

function getApiPackageId(entry: { id: string }): string {
  const raw = entry.id
    .replace(/\.(?:md|mdx)$/i, "")
    .replace(/\/README$/i, "");

  return raw.split("/").filter(Boolean).join("/");
}

function getApiPackageRoute(entry: { id: string }): string {
  const packageId = getApiPackageId(entry);

  if (!packageId) {
    throw new Error(`API package entry "${entry.id}" did not produce a package route.`);
  }

  return getApiRoutePath(packageId);
}

function getApiEntryRouteContext(entry: ApiRouteEntry): ApiEntryRouteContext {
  return {
    path: entry.id,
    reflection: entry.data,
    category: getReflectionCategory(entry.data)
  };
}

function getApiEntryRoute(entry: ApiRouteEntry): string {
  const { path: entryPath, reflection, category } = getApiEntryRouteContext(entry);
  const relativePath = getWebsiteConfig().apiEntryRoute(entryPath, reflection, category);

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

function assertUniqueApiEntryRoutes(entries: ApiRouteEntry[]): void {
  const routes = new Map<string, ApiRouteEntry>();

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

function getGuideContentDir(): string {
  return getWebsiteConfig().guideContentDir;
}

function getExamplesContentDir(): string {
  return getWebsiteConfig().examplesContentDir;
}

function getApiSourceDir(): string {
  return getWebsiteConfig().apiSourceDir;
}

function getIntroContentPath(): string {
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
