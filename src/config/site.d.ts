export interface WebsiteConfigOptions {
  guideRoute?: string;
  examplesRoute?: string;
  guideContentDir?: string;
  examplesContentDir?: string;
  introContentPath?: string;
}

export interface WebsiteConfig {
  guideRoute: string;
  examplesRoute: string;
  guideContentDir: string;
  examplesContentDir: string;
  introContentPath: string;
}

export declare const defaultWebsiteConfig: Readonly<WebsiteConfig>;
export declare function setWebsiteConfig(options?: WebsiteConfigOptions): Readonly<WebsiteConfig>;
export declare function getWebsiteConfig(): Readonly<WebsiteConfig>;
export declare function getGuideRoutePath(...segments: string[]): string;
export declare function getExamplesRoutePath(...segments: string[]): string;
export declare function getGuideContentDir(): string;
export declare function getExamplesContentDir(): string;
export declare function getIntroContentPath(): string;
export declare function joinRoutePath(...segments: Array<string | undefined | null>): string;
export declare function rewriteSiteRoute(value: string): string;
export declare function routeToParam(value: string): string;
