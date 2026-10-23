hexo.extend.filter.register(
  "before_post_render",
  function (data) {
    try {
      const formatedContent = data.content.replace(
        /:::image-grid(?:\s+([\w-]+))?([\s\S]*?):::/g,
        (match, grid, content) => {
          const gridClass = grid ? ` ${grid}` : "";
          return `<span class="image-grid${gridClass}">${content
            .split("\n")
            .filter((v) => v)
            .map((line) => {
              const renderedLine = hexo.render
                .renderSync({
                  text: line,
                  engine: "markdown",
                })
                .replace(/<p>/g, "")
                .replace(/<\/p>/g, "")
                .replace(/<br\s?\>/g, "");
              return /<img/.test(renderedLine)
                ? `<span class="grid-item">${renderedLine}</span>`
                : renderedLine;
            })
            .join("")}</span>`;
        }
      );
      data.content = formatedContent;
    } catch (error) {
      console.log(error);
    }
  },
  1
);
