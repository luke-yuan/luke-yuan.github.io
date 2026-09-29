export default class {
  data() {
    return {
      permalink: "/assets/gr20/route-data.json",
      eleventyExcludeFromCollections: true,
    };
  }

  render({ gr20 }) {
    return JSON.stringify({
      days: gr20.days.map(({ overviewPath, outline, ...day }) => day),
      totals: gr20.totals,
      source: gr20.source,
    });
  }
}
