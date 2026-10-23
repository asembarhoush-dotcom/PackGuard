import { jsx as e, jsxs as I } from "react/jsx-runtime";
import { useState as N } from "react";
import { Pagination as b, PaginationContent as j, PaginationItem as a, PaginationPrevious as C, PaginationNext as k, PaginationEllipsis as g, PaginationLink as A } from "../ui/pagination.es.js";
function U({
  allItems: P,
  itemsPerPage: u,
  initialPage: f = 1,
  onClickPrevious: l,
  onClickNext: h,
  onClickPageNumber: c,
  ...m
}) {
  const r = Math.ceil(P / u), [d, o] = N(f), p = () => {
    l && l(), o((n) => Math.max(1, n - 1));
  }, x = () => {
    h && h(), o((n) => Math.min(r, n + 1));
  };
  return /* @__PURE__ */ e(b, { ...m, children: /* @__PURE__ */ I(j, { children: [
    /* @__PURE__ */ e(a, { children: /* @__PURE__ */ e(C, { href: "#", onClick: p }) }),
    (() => {
      const n = [];
      let s = Math.max(1, d - 1), i = s + 2;
      i > r && (i = r, s = Math.max(1, i - 2)), s > 1 && n.push(
        /* @__PURE__ */ e(a, { children: /* @__PURE__ */ e(g, {}) }, "start-ellipsis")
      );
      for (let t = s; t <= i; t++)
        n.push(
          /* @__PURE__ */ e(a, { children: /* @__PURE__ */ e(
            A,
            {
              href: "#",
              onClick: (M) => {
                M.preventDefault(), o(t), c && c((v) => ({ ...v, pageIndex: t - 1 }));
              },
              isActive: t === d,
              children: t
            }
          ) }, t)
        );
      return i < r && n.push(
        /* @__PURE__ */ e(a, { children: /* @__PURE__ */ e(g, {}) }, "end-ellipsis")
      ), n;
    })(),
    /* @__PURE__ */ e(a, { children: /* @__PURE__ */ e(k, { href: "#", onClick: x }) })
  ] }) });
}
export {
  U as default
};
