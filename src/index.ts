import path from "node:path";
import { satteri } from "@astrojs/markdown-satteri";
import type { AstroIntegration } from "astro";
import { rootPackageDevUrl, rootPackageName, rootPackageJson, projectRootDir, websiteRootDir } from "./config/project.ts";
import { clearLinks } from "./config/link-map.ts";
import { setWebsiteConfig, type WebsiteConfigOptions } from "./config/site.ts";
import { markdownPlugins } from "./plugins/markdown-satteri.ts";

export function website(options: WebsiteConfigOptions = {}): AstroIntegration {
  clearLinks();
  setWebsiteConfig(options);

  return {
    name: "wima-docs-website-template",
    hooks: {
      "astro:config:setup": ({ config, injectRoute, updateConfig }) => {
        injectRoute({
          pattern: "/",
          entrypoint: "wima-docs-website-template/routes/index.astro",
        });

        injectRoute({
          pattern: "/[...page]",
          entrypoint: "wima-docs-website-template/routes/[...page].astro",
        });

        injectRoute({
          pattern: "/examples/[...slug]/example.html",
          entrypoint: "wima-docs-website-template/routes/examples/[...slug]/example.html.ts",
        });

        injectRoute({
          pattern: "/search-index.json",
          entrypoint: "wima-docs-website-template/routes/search-index.json.ts",
        });

        updateConfig({
          site: config.site ?? rootPackageJson.homepage,
          vite: {
            resolve: {
              alias: {
                [rootPackageName]: path.resolve(projectRootDir, rootPackageDevUrl),
                "@configs": path.join(websiteRootDir, "config"),
                "@layouts": path.join(websiteRootDir, "layouts"),
                "@components": path.join(websiteRootDir, "components"),
              },
            },
          },
          markdown: {
            processor: satteri({
              features: {
                directive: true,
              },
              mdastPlugins: markdownPlugins,
            }),
          },
        });
      },
    },
  };
}
