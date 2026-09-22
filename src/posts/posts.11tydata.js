export default {
  layout: "post.njk",
  tags: "posts",
  eleventyComputed: {
    permalink: ({ page }) =>
      `/journal/${page.date.toISOString().slice(0, 10)}-${page.fileSlug}/`,
  },
};
