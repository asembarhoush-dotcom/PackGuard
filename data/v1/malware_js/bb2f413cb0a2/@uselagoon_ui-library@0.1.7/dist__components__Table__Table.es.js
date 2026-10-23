import { jsxs as m, jsx as e } from "react/jsx-runtime";
import { Table as N, TableCaption as f, TableHeader as u, TableRow as d, TableHead as w, TableBody as y, TableCell as o, TableFooter as C } from "../ui/table.es.js";
const b = (l, n) => typeof l == "function" ? l(n) : n, x = ({ columns: l, data: n, caption: h, footer: a, ...p }) => /* @__PURE__ */ m(N, { ...p, children: [
  !!h && /* @__PURE__ */ e(f, { children: h }),
  /* @__PURE__ */ e(u, { children: /* @__PURE__ */ e(d, { children: l.map(({ key: s, columnRender: i, title: c, columnClassName: t }) => /* @__PURE__ */ e(w, { className: t ?? "", children: b(i, c) }, s)) }) }),
  /* @__PURE__ */ e(y, { children: n.map((s) => {
    const i = ["rowClassName", "rowRender", "key"], c = Object.entries(s).filter(([r]) => !i.includes(r)).map((r) => r[1]), { rowClassName: t, rowRender: T } = s;
    return /* @__PURE__ */ e(d, { children: c.map((r) => /* @__PURE__ */ e(o, { className: t, children: b(T, r) }, r)) }, s.key);
  }) }),
  a && /* @__PURE__ */ e(C, { className: a?.footerClassName || "basictable-footer", children: /* @__PURE__ */ m(d, { children: [
    /* @__PURE__ */ e(o, { colSpan: a?.span || l.length - 1, children: a.description }),
    /* @__PURE__ */ e(o, { className: "text-right", children: a.value })
  ] }) })
] });
x.displayName = "Table";
export {
  x as default
};
