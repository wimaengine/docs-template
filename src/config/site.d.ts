export interface WebsiteConfigOptions {
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
  colors?: Partial<WebsiteThemeColors>;
}

export interface WebsiteThemeOptions {
  default?: string;
  schemes?: Record<string, WebsiteThemeSchemeOptions>;
}

export interface WebsiteThemeScheme {
  colors: WebsiteThemeColors;
}

export interface WebsiteTheme {
  default: string;
  schemes: Record<string, WebsiteThemeScheme>;
}

export interface ApiRouteReflection {
  id: number;
  name: string;
  kind: number;
  [key: string]: any;
}

export interface ApiRouteEntry {
  id: string;
  data: ApiRouteReflection;
}

export interface ApiPackageRouteEntry {
  id: string;
  data?: {
    title?: string;
    [key: string]: unknown;
  };
}

export interface ApiEntryRouteContext {
  path: string;
  reflection: ApiRouteReflection;
  category: string | undefined;
}

export type ApiEntryRouteResolver = (
  path: string,
  reflection: ApiRouteReflection,
  category: string | undefined
) => string;

export interface WebsiteConfig {
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

export declare const defaultWebsiteConfig: Readonly<WebsiteConfig>;
export declare function setWebsiteConfig(options?: WebsiteConfigOptions): Readonly<WebsiteConfig>;
export declare function getWebsiteConfig(): Readonly<WebsiteConfig>;
export declare function getWebsiteThemeStyles(theme: WebsiteTheme): string;
export declare function getApiPackageId(entry: ApiPackageRouteEntry): string;
export declare function getApiPackageRoute(entry: ApiPackageRouteEntry): string;
export declare function getGuideEntryRoute(entry: { id: string; slug?: string }): string;
export declare function getGuideRoutePath(...segments: string[]): string;
export declare function getExamplesRoutePath(...segments: string[]): string;
export declare function getApiRoutePath(...segments: string[]): string;
export declare function getApiEntryRoute(entry: ApiRouteEntry): string;
export declare function getApiEntryRouteContext(entry: ApiRouteEntry): ApiEntryRouteContext;
export declare function assertUniqueApiEntryRoutes(entries: ApiRouteEntry[]): void;
export declare function getGuideContentDir(): string;
export declare function getExamplesContentDir(): string;
export declare function getApiSourceDir(): string;
export declare function getIntroContentPath(): string;
export declare function joinRoutePath(...segments: Array<string | undefined | null>): string;
export declare function routeToParam(value: string): string;
