export default {
  layout: "post.njk",
  tags: "posts",
  eleventyComputed: {
    permalink: ({ page }) => `/journal/${page.fileSlug}/`,
  },
};
