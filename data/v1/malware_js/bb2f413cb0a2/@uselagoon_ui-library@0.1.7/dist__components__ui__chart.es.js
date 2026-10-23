import { jsx as s, jsxs as f, Fragment as P } from "react/jsx-runtime";
import * as p from "react";
import * as _ from "recharts";
import { cn as l } from "../../lib/utils.es.js";
const T = { light: "", dark: ".dark" }, j = p.createContext(null);
function y() {
  const c = p.useContext(j);
  if (!c)
    throw new Error("useChart must be used within a <ChartContainer />");
  return c;
}
function K({
  id: c,
  className: e,
  children: n,
  config: r,
  ...a
}) {
  const d = p.useId(), o = `chart-${c || d.replace(/:/g, "")}`;
  return /* @__PURE__ */ s(j.Provider, { value: { config: r }, children: /* @__PURE__ */ f(
    "div",
    {
      "data-slot": "chart",
      "data-chart": o,
      className: l(
        "[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-tooltip-cursor]:stroke-border [&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border [&_.recharts-radial-bar-background-sector]:fill-muted [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border flex aspect-video justify-center text-xs [&_.recharts-dot[stroke='#fff']]:stroke-transparent [&_.recharts-layer]:outline-hidden [&_.recharts-sector]:outline-hidden [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-surface]:outline-hidden",
        e
      ),
      ...a,
      children: [
        /* @__PURE__ */ s(I, { id: o, config: r }),
        /* @__PURE__ */ s(_.ResponsiveContainer, { children: n })
      ]
    }
  ) });
}
const I = ({ id: c, config: e }) => {
  const n = Object.entries(e).filter(([, r]) => r.theme || r.color);
  return n.length ? /* @__PURE__ */ s(
    "style",
    {
      dangerouslySetInnerHTML: {
        __html: Object.entries(T).map(
          ([r, a]) => `
${a} [data-chart=${c}] {
${n.map(([d, o]) => {
            const i = o.theme?.[r] || o.color;
            return i ? `  --color-${d}: ${i};` : null;
          }).join(`
`)}
}
`
        ).join(`
`)
      }
    }
  ) : null;
}, M = _.Tooltip;
function R({
  active: c,
  payload: e,
  className: n,
  indicator: r = "dot",
  hideLabel: a = !1,
  hideIndicator: d = !1,
  label: o,
  labelFormatter: i,
  labelClassName: u,
  formatter: k,
  color: $,
  nameKey: L,
  labelKey: v
}) {
  const { config: g } = y(), w = p.useMemo(() => {
    if (a || !e?.length)
      return null;
    const [t] = e, x = `${v || t?.dataKey || t?.name || "value"}`, b = C(g, t, x), h = !v && typeof o == "string" ? g[o]?.label || o : b?.label;
    return i ? /* @__PURE__ */ s("div", { className: l("font-medium", u), children: i(h, e) }) : h ? /* @__PURE__ */ s("div", { className: l("font-medium", u), children: h }) : null;
  }, [o, i, e, a, u, g, v]);
  if (!c || !e?.length)
    return null;
  const m = e.length === 1 && r !== "dot";
  return /* @__PURE__ */ f(
    "div",
    {
      className: l(
        "border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl",
        n
      ),
      children: [
        m ? null : w,
        /* @__PURE__ */ s("div", { className: "grid gap-1.5", children: e.map((t, x) => {
          const b = `${L || t.name || t.dataKey || "value"}`, h = C(g, t, b), N = $ || t.payload.fill || t.color;
          return /* @__PURE__ */ s(
            "div",
            {
              className: l(
                "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
                r === "dot" && "items-center"
              ),
              children: k && t?.value !== void 0 && t.name ? k(t.value, t.name, t, x, t.payload) : /* @__PURE__ */ f(P, { children: [
                h?.icon ? /* @__PURE__ */ s(h.icon, {}) : !d && /* @__PURE__ */ s(
                  "div",
                  {
                    className: l("shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)", {
                      "h-2.5 w-2.5": r === "dot",
                      "w-1": r === "line",
                      "w-0 border-[1.5px] border-dashed bg-transparent": r === "dashed",
                      "my-0.5": m && r === "dashed"
                    }),
                    style: {
                      "--color-bg": N,
                      "--color-border": N
                    }
                  }
                ),
                /* @__PURE__ */ f(
                  "div",
                  {
                    className: l("flex flex-1 justify-between leading-none", m ? "items-end" : "items-center"),
                    children: [
                      /* @__PURE__ */ f("div", { className: "grid gap-1.5", children: [
                        m ? w : null,
                        /* @__PURE__ */ s("span", { className: "text-muted-foreground", children: h?.label || t.name })
                      ] }),
                      t.value && /* @__PURE__ */ s("span", { className: "text-foreground font-mono font-medium tabular-nums", children: t.value.toLocaleString() })
                    ]
                  }
                )
              ] })
            },
            t.dataKey
          );
        }) })
      ]
    }
  );
}
const H = _.Legend;
function O({
  className: c,
  hideIcon: e = !1,
  payload: n,
  verticalAlign: r = "bottom",
  nameKey: a
}) {
  const { config: d } = y();
  return n?.length ? /* @__PURE__ */ s("div", { className: l("flex items-center justify-center gap-4", r === "top" ? "pb-3" : "pt-3", c), children: n.map((o) => {
    const i = `${a || o.dataKey || "value"}`, u = C(d, o, i);
    return /* @__PURE__ */ f(
      "div",
      {
        className: l("[&>svg]:text-muted-foreground flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3"),
        children: [
          u?.icon && !e ? /* @__PURE__ */ s(u.icon, {}) : /* @__PURE__ */ s(
            "div",
            {
              className: "h-2 w-2 shrink-0 rounded-[2px]",
              style: {
                backgroundColor: o.color
              }
            }
          ),
          u?.label
        ]
      },
      o.value
    );
  }) }) : null;
}
function C(c, e, n) {
  if (typeof e != "object" || e === null)
    return;
  const r = "payload" in e && typeof e.payload == "object" && e.payload !== null ? e.payload : void 0;
  let a = n;
  return n in e && typeof e[n] == "string" ? a = e[n] : r && n in r && typeof r[n] == "string" && (a = r[n]), a in c ? c[a] : c[n];
}
export {
  K as ChartContainer,
  H as ChartLegend,
  O as ChartLegendContent,
  I as ChartStyle,
  M as ChartTooltip,
  R as ChartTooltipContent
};
