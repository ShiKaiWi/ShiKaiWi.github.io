import { readFileSync } from "node:fs";
import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import {
  uniqueTags,
  groupByMonth,
  frontmatterHasRequiredFields,
} from "./src/lib/posts.js";

export default function (eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  eleventyConfig.addPassthroughCopy({ resources: "resources" });

  eleventyConfig.addFilter("uniqueTags", uniqueTags);
  eleventyConfig.addFilter("groupByMonth", groupByMonth);
  eleventyConfig.addFilter("isoDate", (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return d.toISOString().slice(0, 10);
  });

  eleventyConfig.addCollection("blog", (api) => {
    const posts = api.getFilteredByGlob("posts/*.md").sort((a, b) => b.date - a.date);
    for (const post of posts) {
      const raw = readFileSync(post.inputPath, "utf8");
      const missing = frontmatterHasRequiredFields(raw);
      if (missing.length) {
        throw new Error(`Post ${post.inputPath} missing ${missing.join(", ")}`);
      }
    }
    return posts;
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
