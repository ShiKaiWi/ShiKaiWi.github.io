import { uniqueTags, groupByMonth } from "./src/lib/posts.js";

export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  eleventyConfig.addPassthroughCopy({ resources: "resources" });

  eleventyConfig.addFilter("uniqueTags", uniqueTags);
  eleventyConfig.addFilter("groupByMonth", groupByMonth);

  eleventyConfig.addCollection("blog", (api) => {
    return api.getFilteredByGlob("posts/*.md").sort((a, b) => b.date - a.date);
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes" },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
