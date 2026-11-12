import { getCollection } from "astro:content";
import {
  getApiEntryRoute,
  getApiPackageRoute,
  getExamplesRoutePath,
  getGuideEntryRoute
} from "@configs/site.ts";
import { rootPackageName } from "@configs/project.ts";
import {
  getReflectionDescriptionMarkdown,
  getReflectionKindLabel,
  getReflectionKindName,
  getReflectionMemberAnchor,
  getReflectionSignatures,
  getReflectionTags,
  getVisibleReflectionChildren,
  ReflectionKind
} from "../utils/typedoc.ts";
import { withBase } from "../utils/url.ts";
import type {
  ApiCollectionEntry,
  ApiPackageCollectionEntry,
  ExampleCollectionEntry,
  GuideCollectionEntry,
  IntroCollectionEntry,
  SearchEntry
} from "../types.ts";

function createEntry(
  entry: Omit<SearchEntry, "content"> & { content?: string }
): SearchEntry {
  return {
    ...entry,
    description: entry.description?.trim() || undefined,
    content: entry.content?.trim() || undefined
  };
}

function getApiDescription(reflection: ApiCollectionEntry["data"]): string {
  const signature = getReflectionSignatures(reflection)[0];
  return getReflectionDescriptionMarkdown(reflection, signature);
}

function getApiMemberDescription(member: ApiCollectionEntry["data"]): string {
  const signature = getReflectionSignatures(member)[0];
  return getReflectionDescriptionMarkdown(member, signature);
}

function getApiMemberContent(member: ApiCollectionEntry["data"]): string {
  const signature = getReflectionSignatures(member)[0];
  const tags = getReflectionTags(member, signature);

  return [
    getReflectionKindName(member.kind),
    getApiMemberDescription(member),
    ...tags
  ].filter(Boolean).join(" ");
}

function getApiContent(reflection: ApiCollectionEntry["data"]): string {
  const signature = getReflectionSignatures(reflection)[0];
  const tags = getReflectionTags(reflection, signature);

  return [
    getReflectionKindName(reflection.kind),
    getApiDescription(reflection),
    ...tags
  ].filter(Boolean).join(" ");
}

function addApiEntries(entries: SearchEntry[], apiEntries: ApiCollectionEntry[]): void {
  for (const entry of apiEntries) {
    const reflection = entry.data;
    const route = getApiEntryRoute(entry);
    const description = getApiDescription(reflection);

    entries.push(createEntry({
      id: `api:${entry.id}`,
      title: reflection.name,
      href: withBase(route),
      kind: "api",
      description,
      content: getApiContent(reflection)
    }));

    const members = getVisibleReflectionChildren(reflection)
      .filter((member) => reflection.kind !== ReflectionKind.Enum || member.kind === ReflectionKind.EnumMember);

    for (const member of members) {
      const memberDescription = getApiMemberDescription(member);

      entries.push(createEntry({
        id: `api-member:${entry.id}:${member.id}`,
        title: `${reflection.name}.${member.name}`,
        href: withBase(`${route}#${getReflectionMemberAnchor(member)}`),
        kind: "api-member",
        description: memberDescription,
        content: [
          reflection.name,
          getReflectionKindLabel(reflection.kind),
          member.name,
          getReflectionKindName(member.kind),
          getApiMemberContent(member)
        ].join(" ")
      }));
    }
  }
}

function addContentEntries(
  entries: SearchEntry[],
  introEntries: IntroCollectionEntry[],
  guideEntries: GuideCollectionEntry[],
  exampleEntries: ExampleCollectionEntry[],
  apiPackageEntries: ApiPackageCollectionEntry[]
): void {
  const introEntry = introEntries[0];
  if (introEntry) {
    entries.push(createEntry({
      id: "intro",
      title: introEntry.data.title ?? rootPackageName,
      href: withBase("/"),
      kind: "intro",
      description: introEntry.data.description,
      content: introEntry.body
    }));
  }

  for (const entry of guideEntries) {
    entries.push(createEntry({
      id: `guide:${entry.id}`,
      title: entry.data.title,
      href: withBase(getGuideEntryRoute(entry)),
      kind: "guide",
      description: entry.data.description,
      content: entry.body
    }));
  }

  for (const entry of exampleEntries) {
    entries.push(createEntry({
      id: `example:${entry.id}`,
      title: entry.data.title,
      href: withBase(getExamplesRoutePath(entry.id)),
      kind: "example",
      content: [entry.data.filePath, entry.data.source].join(" ")
    }));
  }

  for (const entry of apiPackageEntries) {
    entries.push(createEntry({
      id: `api-package:${entry.id}`,
      title: entry.data.title,
      href: withBase(getApiPackageRoute(entry)),
      kind: "api-package",
      description: entry.data.description,
      content: entry.body
    }));
  }
}

export async function GET(): Promise<Response> {
  const [introEntries, guideEntries, exampleEntries, apiEntries, apiPackageEntries] = await Promise.all([
    getCollection("intro"),
    getCollection("guide"),
    getCollection("examples"),
    getCollection("api"),
    getCollection("apiPackages")
  ]) as [
    IntroCollectionEntry[],
    GuideCollectionEntry[],
    ExampleCollectionEntry[],
    ApiCollectionEntry[],
    ApiPackageCollectionEntry[]
  ];
  const entries: SearchEntry[] = [];

  addContentEntries(entries, introEntries, guideEntries, exampleEntries, apiPackageEntries);
  addApiEntries(entries, apiEntries);

  entries.sort((a, b) => a.title.localeCompare(b.title) || a.href.localeCompare(b.href));

  return new Response(JSON.stringify(entries), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=31536000, immutable"
    }
  });
}
