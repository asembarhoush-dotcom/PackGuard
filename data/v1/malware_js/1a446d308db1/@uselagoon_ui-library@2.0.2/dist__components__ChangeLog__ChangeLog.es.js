import { jsx as l, jsxs as d } from "react/jsx-runtime";
import F from "./ChangeLogItem.es.js";
import N from "../Checkbox/Checkbox.es.js";
import { useState as f, useRef as S, useMemo as y, useEffect as h } from "react";
function I({ changeLogItems: r = [] }) {
  const [i, n] = f(r), [o, c] = f(/* @__PURE__ */ new Set(["All"])), [m, u] = f(10), a = S(null);
  if (!i || i.length === 0)
    return /* @__PURE__ */ l("div", { children: "No activity to display." });
  const b = y(() => {
    const e = /* @__PURE__ */ new Set(["All"]);
    return r?.forEach((s) => {
      s.tags?.forEach((t) => {
        e.add(t);
      });
    }), Array.from(e);
  }, [r]);
  h(() => {
    const e = new IntersectionObserver(
      (s) => {
        s[0].isIntersecting && u((t) => t + 10);
      },
      { threshold: 1 }
    );
    return a.current && e.observe(a.current), () => e.disconnect();
  }, [i]), h(() => {
    u(10);
  }, [o]);
  const v = () => b.map((e) => /* @__PURE__ */ l(N, { id: e, label: e, className: "my-2", checked: o.has(e), onCheckedChange: (s) => w(e, s) }, e)), w = (e, s) => {
    const t = new Set(o);
    if (e === "All") {
      s && (c(/* @__PURE__ */ new Set(["All"])), n(r));
      return;
    }
    if (t.delete("All"), s ? t.add(e) : t.delete(e), t.size === 0) {
      c(/* @__PURE__ */ new Set(["All"])), n(r);
      return;
    }
    c(t);
    const A = r?.filter((x) => x.tags?.some((C) => t.has(C)));
    n(A);
  }, p = i.slice(0, m);
  return /* @__PURE__ */ d("div", { className: "flex gap-8 justify-between", children: [
    /* @__PURE__ */ d("div", { className: "flex-1", children: [
      p.map((e) => /* @__PURE__ */ l(F, { ...e }, e.id)),
      m < i.length && /* @__PURE__ */ l("div", { ref: a, className: "h-4 w-full" })
    ] }),
    /* @__PURE__ */ d("aside", { className: "min-w-[300px]", "aria-label": "Activity filters", children: [
      /* @__PURE__ */ l("h3", { className: "text-sm font-semibold mb-2", children: "Filter" }),
      v()
    ] })
  ] });
}
export {
  I as default
};
