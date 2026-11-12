import type { JSONOutput } from "typedoc";

export interface ContentLinkEntry {
  id: string;
  slug?: string;
  filePath?: string;
}

export interface IntroCollectionEntry {
  id: string;
  body: string;
  data: {
    title?: string;
    description?: string;
    ogImage?: string;
    noindex?: boolean;
  };
}

export interface ApiCollectionEntry {
  id: string;
  filePath: string;
  data: JSONOutput.DeclarationReflection;
}

export interface ApiPackageCollectionEntry {
  id: string;
  body: string;
  data: {
    title: string;
    description?: string;
    ogImage?: string;
    noindex?: boolean;
  };
}

export interface GuideCollectionEntry {
  id: string;
  slug?: string;
  body: string;
  data: {
    title: string;
    description?: string;
    ogImage?: string;
    noindex?: boolean;
  };
}

export interface ExampleCollectionEntry {
  id: string;
  filePath: string;
  data: {
    title: string;
    filePath: string;
    source: string;
  };
}

export type SearchEntryKind =
  | "intro"
  | "guide"
  | "example"
  | "api-package"
  | "api"
  | "api-member";

export interface SearchEntry {
  id: string;
  title: string;
  href: string;
  kind: SearchEntryKind;
  description?: string;
  content?: string;
}
