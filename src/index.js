import path from "node:path";
import { satteri } from "@astrojs/markdown-satteri";
import { rootPackageDevUrl, rootPackageName, projectRootDir, websiteRootDir } from "./config/project.js";
import { setWebsiteConfig } from "./config/site.js";
import { markdownPlugins } from "./plugins/markdown-satteri.js";

export function website(options = {}) {
  setWebsiteConfig(options);

  return {
    name: "wima-docs-website-template",
    hooks: {
      "astro:config:setup": ({ injectRoute, updateConfig }) => {
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

        updateConfig({
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
