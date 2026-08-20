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
      guideContentDir: "content/guide",
      examplesContentDir: "examples",
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

## Expected Project Layout

- `README.md` at the project root
- `content/guide` for guide markdown files
- `examples` for runnable example modules
- `assets` for public images and example assets

All of those locations can be overridden through the integration options.
# docs-template
