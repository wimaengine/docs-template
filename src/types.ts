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
  };
}

export interface GuideCollectionEntry {
  id: string;
  slug?: string;
  body: string;
  data: {
    title: string;
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
