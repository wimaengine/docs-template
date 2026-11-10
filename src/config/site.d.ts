export interface WebsiteConfigOptions {
  guideRoute?: string;
  examplesRoute?: string;
  apiRoute?: string;
  apiEntryRoute?: ApiEntryRouteResolver;
  guideContentDir?: string;
  examplesContentDir?: string;
  apiSourceDir?: string;
  introContentPath?: string;
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
  apiEntryRoute: ApiEntryRouteResolver;
  guideContentDir: string;
  examplesContentDir: string;
  apiSourceDir: string;
  introContentPath: string;
}

export declare const defaultWebsiteConfig: Readonly<WebsiteConfig>;
export declare function setWebsiteConfig(options?: WebsiteConfigOptions): Readonly<WebsiteConfig>;
export declare function getWebsiteConfig(): Readonly<WebsiteConfig>;
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
export declare function rewriteSiteRoute(value: string): string;
export declare function routeToParam(value: string): string;
