export interface LinkRouteReflection {
  id?: number;
  name?: string;
  qualifiedName?: string;
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
export declare function getLink(alias: string): string | undefined;
export declare function addIntroLink(entry: LinkRouteEntry): void;
export declare function addGuideLink(entry: LinkRouteEntry): void;
export declare function addExampleLink(entry: LinkRouteEntry): void;
export declare function addApiLink(entry: LinkRouteEntry): void;
export declare function addApiPackageLink(entry: LinkRouteEntry): void;

export declare function resolveSiteLink(value: string): string;
