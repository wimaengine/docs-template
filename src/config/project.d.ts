export interface RootPackageJson {
  name: string;
  version?: string;
  source?: string;
  main?: string;
  module?: string;
  browser?: string;
  exports?: unknown;
  type?: string;
  jsdelivr?: string;
  unpkg?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

export declare const rootPackageJson: RootPackageJson;
export declare const rootPackageName: string;
export declare const rootPackageDevUrl: string;
export declare const packageRootDir: string;
export declare const projectRootDir: string;
export declare const websiteRootDir: string;
