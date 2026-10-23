import { jsx as a, jsxs as w } from "react/jsx-runtime";
import { useState as c, useEffect as v } from "react";
import x from "./ChangeFeed.es.js";
import { ChangeFeedDataSchema as j } from "../../schemas/changeFeed.es.js";
function I({
  sourceData: t = "https://raw.githubusercontent.com/amazeeio/lagoon-changefeed-data/refs/heads/main/changefeed.json",
  refetchInterval: n = 6e5,
  fallbackData: i = [],
  onError: g,
  showLoading: u = !0
}) {
  const [d, f] = c(i), [p, s] = c(!!t), [l, h] = c(null);
  return v(() => {
    if (!t) {
      s(!1);
      return;
    }
    const m = async () => {
      try {
        s(!0), h(null);
        const e = await fetch(t, {
          cache: "no-cache"
        });
        if (!e.ok)
          throw new Error(`Failed to fetch change feed data: ${e.statusText}`);
        const r = await e.json(), o = j.safeParse(r);
        if (!o.success)
          throw console.error("Changefeed validation failed:", o.error.format()), new Error("Invalid changefeed data format");
        f(o.data.changes);
      } catch (e) {
        const r = e instanceof Error ? e : new Error("Unknown error");
        h(r), g?.(r), f(i);
      } finally {
        s(!1);
      }
    };
    if (m(), n > 0) {
      const e = setInterval(m, n);
      return () => clearInterval(e);
    }
  }, [t, n]), p && u ? /* @__PURE__ */ a("div", { className: "flex items-center justify-center p-8", children: /* @__PURE__ */ a("div", { className: "text-gray-500", children: "Loading changefeed..." }) }) : l && d.length === 0 ? /* @__PURE__ */ a("div", { className: "flex items-center justify-center p-8", children: /* @__PURE__ */ w("div", { className: "text-red-500", children: [
    "Failed to load changefeed. ",
    l.message
  ] }) }) : /* @__PURE__ */ a(x, { changeFeedItems: d });
}
export {
  I as default
};
