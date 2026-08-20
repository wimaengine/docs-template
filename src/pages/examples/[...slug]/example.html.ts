import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { buildImportMap } from "../../../utils/import-map.js";
import { withBase } from "../../../utils/url.js";

interface ExampleCollectionEntry {
  id: string;
  data: {
    title: string;
    source: string;
  };
}

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

function buildExampleHtml(title: string, importMap: string, source: string): string {
  const runnerScript = source.replace(/<\/script/gi, "<\\/script");
  const safeImportMap = importMap.replace(/<\/script/gi, "<\\/script");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #05070a;
      }

      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: var(--bg);
        color: #eef2f7;
        overflow: hidden;
      }

      canvas {
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

  return new Response(buildExampleHtml(exampleEntry.data.title, importMap, source), {
    headers: {
      "content-type": "text/html; charset=utf-8"
    }
  });
};
