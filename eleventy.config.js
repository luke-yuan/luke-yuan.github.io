export default function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addFilter("readableDate", (date) =>
    new Intl.DateTimeFormat("en", {
      month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
    }).format(date)
  );
  eleventyConfig.addFilter("isoDate", (date) => date.toISOString().slice(0, 10));
  eleventyConfig.addFilter("githubPath", (path) =>
    path.replace(/^\.\//, "").split("/").map(encodeURIComponent).join("/")
  );
  return {
    dir: { input: "src", output: "_site" },
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
  };
}
