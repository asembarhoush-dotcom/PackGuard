const pagination = require("hexo-pagination");
const fs = require("fs");
const path = require("path");

const getSeriesInfo = () => {
  try {
    const seriesInfo = JSON.parse(
      fs.readFileSync(path.join(hexo.base_dir, "assets-db/series.json"), "utf-8")
    );
    return seriesInfo;
  } catch (error) {
    return {};
  }
};

hexo.extend.generator.register("series", function (locals) {
  const seriesMap = {};
  const seriesInfo = getSeriesInfo();

  locals.posts.forEach((post) => {
    const series = post.series;
    if (series) {
      if (!seriesMap[series]) {
        seriesMap[series] = [];
      }
      seriesMap[series].push(post);
    }
  });

  const result = [];

  Object.keys(seriesMap).forEach((seriesName) => {
    const posts = seriesMap[seriesName].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const pages = pagination(`series/${seriesName}/`, posts, {
      perPage: hexo.config.per_page,
      layout: ["series"],
      format: "page/%d/",
      data: {
        series: seriesName,
        seriesPosts: posts,
        seriesInfo: seriesInfo[seriesName],
      },
    });

    result.push(...pages);
  });

  return result;
});
