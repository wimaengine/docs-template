# wima-docs-website-template

Astro integration package for the docs website template.

The package source lives in `src/`.

## Usage

```js
import { defineConfig } from "astro/config";
import { website } from "wima-docs-website-template";

export default defineConfig({
  integrations: [
    website({
      guideRoute: "/guide",
      examplesRoute: "/examples",
      apiRoute: "/api",
      sourceBranch: "main",
      theme: {
        default: "ocean",
        schemes: {
          ocean: {
            colors: {
              background: "#05070a",
              accent: "#7dd3fc"
            }
          },
          forest: {
            colors: {
              background: "#071a12",
              accent: "#86efac"
            }
          }
        }
      },
      guideContentDir: "content/guide",
      examplesContentDir: "examples",
      apiSourceDir: "src",
      apiEntryRoute: (path, reflection, category) => {
        return category
          ? `${category}/${reflection.name}`
          : path;
      },
    }),
  ],
});
```

`apiEntryRoute` is optional. It receives the stable API entry path, the serialized TypeDoc reflection, and the first `@category` value when present. It must return a deterministic path relative to `apiRoute`. Without a custom resolver, entries use a `kind/name` path such as `/api/function/formatDate`, preserving the TypeDoc reflection name exactly.

`sourceBranch` controls the branch used by GitHub source links. It defaults to `main`.

Theme scheme names are arbitrary identifiers. Each scheme writes the template's global CSS variables, and missing colors use the default values. Color values must be hexadecimal strings. Set `theme.default` to choose the scheme rendered on the document root. When both `dark` and `light` schemes are present, setting the default to `auto` adds an `auto` option that follows the operating system's color preference. Without both scheme names, `auto` is ignored.

## Host Content

Create a `src/content.config.ts` file in the host project:

```ts
export { collections } from "wima-docs-website-template/loaders";
```

That keeps the host project on Astro's normal source layout. The integration injects the website routes, so there is no need to point `srcDir` at the package.

The API docs route is generated with TypeDoc from the host library's source files. If the source directory contains an `index` entry point (`.js`, `.mjs`, `.cjs`, `.ts`, or `.tsx`), TypeDoc follows that public entry point; otherwise it documents the source files in the directory. By default it reads from `src/` and serves the docs at `/api`.

The host project must provide TypeScript because TypeDoc uses the host project's `tsconfig.json` (or `.configs/tsconfig.lib.json` when present) to resolve JavaScript and JSDoc types.

## Expected Project Layout

- `README.md` at the project root
- `content/guide` for guide markdown files
- `examples` for runnable example modules
- `src` for the library source files that drive the API docs
- `assets` for public images and example assets

All of those locations can be overridden through the integration options.
# docs-template
