import { jsx as a, jsxs as v } from "react/jsx-runtime";
import { useState as i, useEffect as w } from "react";
import x from "./ChangeLog.es.js";
import { ChangeLogDataSchema as L } from "../../schemas/changeLog.es.js";
function I({
  sourceData: r,
  refetchInterval: n = 6e5,
  fallbackData: c = [],
  onError: m,
  showLoading: u = !0
}) {
  const [l, d] = i(c), [p, o] = i(!!r), [f, g] = i(null);
  return w(() => {
    if (!r) {
      o(!1);
      return;
    }
    const h = async () => {
      try {
        o(!0), g(null);
        const e = await fetch(r, {
          cache: "no-cache"
        });
        if (!e.ok)
          throw new Error(`Failed to fetch changelog data: ${e.statusText}`);
        const t = await e.json(), s = L.safeParse(t);
        if (!s.success)
          throw console.error("Changelog validation failed:", s.error.format()), new Error("Invalid changelog data format");
        d(s.data.changes);
      } catch (e) {
        const t = e instanceof Error ? e : new Error("Unknown error");
        g(t), m?.(t), d(c);
      } finally {
        o(!1);
      }
    };
    if (h(), n > 0) {
      const e = setInterval(h, n);
      return () => clearInterval(e);
    }
  }, [r, n]), p && u ? /* @__PURE__ */ a("div", { className: "flex items-center justify-center p-8", children: /* @__PURE__ */ a("div", { className: "text-gray-500", children: "Loading changelog..." }) }) : f && l.length === 0 ? /* @__PURE__ */ a("div", { className: "flex items-center justify-center p-8", children: /* @__PURE__ */ v("div", { className: "text-red-500", children: [
    "Failed to load changelog. ",
    f.message
  ] }) }) : /* @__PURE__ */ a(x, { changeLogItems: l });
}
export {
  I as default
};
