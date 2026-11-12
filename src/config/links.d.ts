export interface LinkRouteReflection {
  id?: number;
  name?: string;
  qualifiedName?: string;
  flags?: { isStatic?: boolean };
  filePath?: string;
  sources?: Array<{ fileName?: string }>;
  children?: LinkRouteReflection[];
  signatures?: LinkRouteReflection[];
  getSignature?: LinkRouteReflection;
  setSignature?: LinkRouteReflection;
  [key: string]: unknown;
}

export interface LinkRouteEntry {
  id: string;
  slug?: string;
  filePath?: string;
  data?: LinkRouteReflection;
}

export declare function addLink(alias: string, route: string): void;
export declare function addLinks(entries: Array<[string, string]>): void;
export declare function getLink(alias: string): string | undefined;
export declare function addIntroLinks(entries: LinkRouteEntry[]): void;
export declare function addGuideLinks(entries: LinkRouteEntry[]): void;
export declare function addExampleLinks(entries: LinkRouteEntry[]): void;
export declare function addApiLinks(entries: LinkRouteEntry[]): void;
export declare function addApiPackageLinks(entries: LinkRouteEntry[]): void;

export declare function resolveSiteLink(value: string): string;
