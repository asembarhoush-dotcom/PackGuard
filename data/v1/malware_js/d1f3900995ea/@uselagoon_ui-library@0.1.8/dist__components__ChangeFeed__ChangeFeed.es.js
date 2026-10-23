import { jsx as r, jsxs as n } from "react/jsx-runtime";
import C from "./ChangeFeedItem.es.js";
import g from "../Checkbox/Checkbox.es.js";
import { useState as m, useRef as S, useMemo as y, useEffect as h } from "react";
function I({ changeFeedItems: l = [] }) {
  const [i, a] = m(l), [c, o] = m(/* @__PURE__ */ new Set(["All"])), [f, u] = m(10), d = S(null);
  if (!i || i.length === 0)
    return /* @__PURE__ */ r("div", { className: "flex items-center justify-center min-h-[400px]", children: /* @__PURE__ */ n("div", { className: "border rounded-lg p-8 max-w-md text-center", children: [
      /* @__PURE__ */ r("p", { className: "text-lg font-medium mb-2", children: "No activity to display" }),
      /* @__PURE__ */ r("p", { className: "text-sm", children: "Check back later for updates and new features." })
    ] }) });
  const b = y(() => {
    const e = /* @__PURE__ */ new Set(["All"]);
    return l?.forEach((s) => {
      s.tags?.forEach((t) => {
        e.add(t);
      });
    }), Array.from(e);
  }, [l]);
  h(() => {
    const e = new IntersectionObserver(
      (s) => {
        s[0].isIntersecting && u((t) => t + 10);
      },
      { threshold: 1 }
    );
    return d.current && e.observe(d.current), () => e.disconnect();
  }, [i]), h(() => {
    u(10);
  }, [c]);
  const p = () => b.map((e) => /* @__PURE__ */ r(g, { id: e, label: e, className: "my-2", checked: c.has(e), onCheckedChange: (s) => v(e, s) }, e)), v = (e, s) => {
    const t = new Set(c);
    if (e === "All") {
      s && (o(/* @__PURE__ */ new Set(["All"])), a(l));
      return;
    }
    if (t.delete("All"), s ? t.add(e) : t.delete(e), t.size === 0) {
      o(/* @__PURE__ */ new Set(["All"])), a(l);
      return;
    }
    o(t);
    const w = l?.filter((N) => N.tags?.some((A) => t.has(A)));
    a(w);
  }, x = i.slice(0, f);
  return /* @__PURE__ */ n("div", { className: "flex gap-8 justify-between", children: [
    /* @__PURE__ */ n("div", { className: "flex-1", children: [
      x.map((e) => /* @__PURE__ */ r(C, { ...e }, e.id)),
      f < i.length && /* @__PURE__ */ r("div", { ref: d, className: "h-4 w-full" })
    ] }),
    /* @__PURE__ */ n("aside", { className: "min-w-[300px]", "aria-label": "Activity filters", children: [
      /* @__PURE__ */ r("h3", { className: "text-sm font-semibold mb-2", children: "Filter" }),
      p()
    ] })
  ] });
}
export {
  I as default
};
