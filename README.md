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
      guideContentDir: "content/guide",
      examplesContentDir: "examples",
      apiSourceDir: "src",
    }),
  ],
});
```

## Host Content

Create a `src/content.config.js` file in the host project:

```js
export { collections } from "wima-docs-website-template/loaders";
```

That keeps the host project on Astro's normal source layout. The integration injects the website routes, so there is no need to point `srcDir` at the package.

The API docs route is generated from the host library's source files. By default it reads from `src/` and serves the docs at `/api`.

## Expected Project Layout

- `README.md` at the project root
- `content/guide` for guide markdown files
- `examples` for runnable example modules
- `src` for the library source files that drive the API docs
- `assets` for public images and example assets

All of those locations can be overridden through the integration options.
# docs-template
