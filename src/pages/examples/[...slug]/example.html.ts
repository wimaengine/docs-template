import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { getWebsiteConfig, getWebsiteThemeStyles } from "../../../config/site.ts";
import { buildImportMap } from "../../../utils/import-map.ts";
import { withBase } from "../../../utils/url.ts";
import type { WebsiteConfig } from "../../../config/site.ts";
import type { ExampleCollectionEntry } from "../../../types.ts";

function rewriteAssetLiterals(script: string): string {
  return script.replace(
    /(["'`])\/?assets\/([^"'`]+)\1/g,
    (_match: string, quote: string, rest: string) => {
      return `${quote}${withBase(`/${rest}`)}${quote}`;
    },
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "\"":
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return character;
    }
  });
}

function resolveAssetPath(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  return /^[a-z][a-z\d+.-]*:|^\/\//i.test(normalized)
    ? normalized
    : withBase(normalized);
}

function buildSeoIconMarkup(seo: WebsiteConfig["seo"], theme: WebsiteConfig["theme"]): string {
  const lightThemeColor = theme.schemes.light?.colors.background;
  const darkThemeColor = theme.schemes.dark?.colors.background;
  const activeThemeColor = theme.schemes[theme.default]?.colors.background;
  const faviconTags = theme.default === "auto"
    ? [
        theme.schemes.light?.favicon
          ? `<link rel="icon" media="(prefers-color-scheme: light)" href="${escapeHtml(resolveAssetPath(theme.schemes.light.favicon) || "")}" />`
          : undefined,
        theme.schemes.dark?.favicon
          ? `<link rel="icon" media="(prefers-color-scheme: dark)" href="${escapeHtml(resolveAssetPath(theme.schemes.dark.favicon) || "")}" />`
          : undefined
      ]
    : [
        theme.schemes[theme.default]?.favicon
          ? `<link rel="icon" href="${escapeHtml(resolveAssetPath(theme.schemes[theme.default].favicon) || "")}" />`
          : undefined
      ];
  const appleTouchIconTags = theme.default === "auto"
    ? [
        theme.schemes.light?.appleTouchIcon
          ? `<link rel="apple-touch-icon" media="(prefers-color-scheme: light)" href="${escapeHtml(resolveAssetPath(theme.schemes.light.appleTouchIcon) || "")}" />`
          : undefined,
        theme.schemes.dark?.appleTouchIcon
          ? `<link rel="apple-touch-icon" media="(prefers-color-scheme: dark)" href="${escapeHtml(resolveAssetPath(theme.schemes.dark.appleTouchIcon) || "")}" />`
          : undefined
      ]
    : [
        theme.schemes[theme.default]?.appleTouchIcon
          ? `<link rel="apple-touch-icon" href="${escapeHtml(resolveAssetPath(theme.schemes[theme.default].appleTouchIcon) || "")}" />`
          : undefined
      ];
  const maskIconTags = theme.default === "auto"
    ? [
        theme.schemes.light?.maskIcon
          ? `<link rel="mask-icon" media="(prefers-color-scheme: light)" href="${escapeHtml(resolveAssetPath(theme.schemes.light.maskIcon) || "")}"${theme.schemes.light.maskIconColor || lightThemeColor ? ` color="${escapeHtml(theme.schemes.light.maskIconColor || lightThemeColor || "")}"` : ""} />`
          : undefined,
        theme.schemes.dark?.maskIcon
          ? `<link rel="mask-icon" media="(prefers-color-scheme: dark)" href="${escapeHtml(resolveAssetPath(theme.schemes.dark.maskIcon) || "")}"${theme.schemes.dark.maskIconColor || darkThemeColor ? ` color="${escapeHtml(theme.schemes.dark.maskIconColor || darkThemeColor || "")}"` : ""} />`
          : undefined
      ]
    : [
        theme.schemes[theme.default]?.maskIcon
          ? `<link rel="mask-icon" href="${escapeHtml(resolveAssetPath(theme.schemes[theme.default].maskIcon) || "")}"${theme.schemes[theme.default].maskIconColor || activeThemeColor ? ` color="${escapeHtml(theme.schemes[theme.default].maskIconColor || activeThemeColor || "")}"` : ""} />`
          : undefined
      ];
  const themeColorTags = theme.default === "auto"
    ? [
        lightThemeColor
          ? `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${escapeHtml(lightThemeColor)}" />`
          : undefined,
        darkThemeColor
          ? `<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${escapeHtml(darkThemeColor)}" />`
          : undefined
      ]
    : [
        activeThemeColor
          ? `<meta name="theme-color" content="${escapeHtml(activeThemeColor)}" />`
          : undefined
      ];
  const tags = [
    ...faviconTags,
    ...appleTouchIconTags,
    ...maskIconTags,
    ...themeColorTags,
    seo.manifest
      ? `<link rel="manifest" href="${escapeHtml(resolveAssetPath(seo.manifest) || "")}" />`
      : undefined
  ];

  return tags.filter((tag): tag is string => Boolean(tag)).join("\n    ");
}

function buildExampleHtml(
  title: string,
  importMap: string,
  source: string,
  locale: string,
  seo: WebsiteConfig["seo"],
  theme: WebsiteConfig["theme"],
  themeStyles: string
): string {
  const runnerScript = source.replace(/<\/script/gi, "<\\/script");
  const safeImportMap = importMap.replace(/<\/script/gi, "<\\/script");

  return `<!doctype html>
<html lang="${escapeHtml(locale)}" data-theme="${escapeHtml(theme.default)}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    ${buildSeoIconMarkup(seo, theme)}
    <title>${escapeHtml(title)}</title>
    <style>${themeStyles}</style>
    <style>
      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: var(--bg);
        color: var(--text);
        overflow: hidden;
      }

      canvas {
        display: block;
        width: 100%;
        height: 100%;
        background-color: black;
        touch-action: none;
      }

      .dg.ac {
        position: fixed;
        top: 0;
        left: auto;
        right: 0;
        z-index: 10000;
      }

      .performance-monitor {
        position: fixed;
        top: 0%;
        left: 0%;
        right: auto;
        cursor: pointer;
        opacity: 0.9;
        z-index: 10000;
      }
    </style>
    <script type="importmap">${safeImportMap}</script>
  </head>
  <body>
    <script type="module">${runnerScript}</script>
  </body>
</html>`;
}

export async function getStaticPaths() {
  const examples = (await getCollection("examples")) as ExampleCollectionEntry[];

  return examples.map((entry) => ({
    params: {
      slug: entry.id
    }
  }));
}

export const GET: APIRoute = async ({ params }) => {
  const examples = (await getCollection("examples")) as ExampleCollectionEntry[];
  const slug = params.slug ?? "";
  const exampleEntry = examples.find((entry) => entry.id === slug);

  if (!exampleEntry) {
    return new Response("Not found", { status: 404 });
  }

  const isProd = import.meta.env.PROD;
  const importMap = buildImportMap(isProd);
  const source = isProd ? rewriteAssetLiterals(exampleEntry.data.source) : exampleEntry.data.source;
  const { theme, seo } = getWebsiteConfig();

  return new Response(
    buildExampleHtml(
      exampleEntry.data.title,
      importMap,
      source,
      seo.locale,
      seo,
      theme,
      getWebsiteThemeStyles(theme)
    ),
    {
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    }
  );
};
