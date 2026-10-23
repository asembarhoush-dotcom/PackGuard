import { jsxs as l, jsx as r, Fragment as j } from "react/jsx-runtime";
import { useState as u, useRef as x, useEffect as O } from "react";
import { Button as g } from "../ui/button.es.js";
import { Popover as X, PopoverTrigger as Z, PopoverContent as _ } from "../ui/popover.es.js";
import { Calendar as ee } from "../ui/calendar.es.js";
import { DateInput as C } from "./date-input.es.js";
import { Label as te } from "../ui/label.es.js";
import { Select as oe, SelectTrigger as re, SelectValue as ne, SelectContent as ae, SelectItem as se } from "../ui/select.es.js";
import { Switch as le } from "../ui/switch.es.js";
import { cn as $ } from "../../lib/utils.es.js";
import { ChevronUp as ce, ChevronDown as ie, Check as me } from "lucide-react";
const k = (c, i = "en-us") => c.toLocaleDateString(i, {
  month: "short",
  day: "numeric",
  year: "numeric"
}), B = (c) => {
  if (typeof c == "string") {
    const i = c.split("-").map((p) => Number.parseInt(p, 10));
    return new Date(i[0], i[1] - 1, i[2]);
  } else
    return c;
}, b = [
  { name: "today", label: "Today" },
  { name: "yesterday", label: "Yesterday" },
  { name: "last7", label: "Last 7 days" },
  { name: "last14", label: "Last 14 days" },
  { name: "last30", label: "Last 30 days" },
  { name: "thisWeek", label: "This Week" },
  { name: "lastWeek", label: "Last Week" },
  { name: "thisMonth", label: "This Month" },
  { name: "lastMonth", label: "Last Month" }
], de = ({
  initialDateFrom: c,
  // No default here, allow it to be undefined
  initialDateTo: i,
  // No default here, allow it to be undefined
  initialCompareFrom: H,
  initialCompareTo: p,
  onUpdate: F,
  align: U = "end",
  locale: D = "en-US",
  showCompare: V = !0,
  rangeText: A = void 0,
  ...q
}) => {
  const z = c !== void 0, [L, v] = u(!1), [n, d] = u(() => {
    if (z) {
      const e = B(c), o = i ? B(i) : e;
      return { from: e, to: o };
    } else {
      const e = new Date((/* @__PURE__ */ new Date()).setHours(0, 0, 0, 0));
      return { from: e, to: e };
    }
  }), [a, m] = u(() => {
    if (H) {
      const e = new Date(new Date(H).setHours(0, 0, 0, 0)), o = p ? new Date(new Date(p).setHours(0, 0, 0, 0)) : e;
      return { from: e, to: o };
    }
  }), [N, f] = u(z), R = x(), S = x(), M = x(!1), h = x(!1), [W, T] = u(void 0), [w, G] = u(typeof window < "u" ? window.innerWidth < 960 : !1);
  O(() => {
    const e = () => {
      G(window.innerWidth < 960);
    };
    return window.addEventListener("resize", e), () => {
      window.removeEventListener("resize", e);
    };
  }, []);
  const E = (e) => {
    const o = b.find(({ name: P }) => P === e);
    if (!o) throw new Error(`Unknown date range preset: ${e}`);
    const t = /* @__PURE__ */ new Date(), s = /* @__PURE__ */ new Date(), y = t.getDate() - t.getDay();
    switch (o.name) {
      case "today":
        t.setHours(0, 0, 0, 0), s.setHours(23, 59, 59, 999);
        break;
      case "yesterday":
        t.setDate(t.getDate() - 1), t.setHours(0, 0, 0, 0), s.setDate(s.getDate() - 1), s.setHours(23, 59, 59, 999);
        break;
      case "last7":
        t.setDate(t.getDate() - 6), t.setHours(0, 0, 0, 0), s.setHours(23, 59, 59, 999);
        break;
      case "last14":
        t.setDate(t.getDate() - 13), t.setHours(0, 0, 0, 0), s.setHours(23, 59, 59, 999);
        break;
      case "last30":
        t.setDate(t.getDate() - 29), t.setHours(0, 0, 0, 0), s.setHours(23, 59, 59, 999);
        break;
      case "thisWeek":
        t.setDate(y), t.setHours(0, 0, 0, 0), s.setHours(23, 59, 59, 999);
        break;
      case "lastWeek":
        t.setDate(t.getDate() - 7 - t.getDay()), s.setDate(s.getDate() - s.getDay() - 1), t.setHours(0, 0, 0, 0), s.setHours(23, 59, 59, 999);
        break;
      case "thisMonth":
        t.setDate(1), t.setHours(0, 0, 0, 0), s.setHours(23, 59, 59, 999);
        break;
      case "lastMonth":
        t.setMonth(t.getMonth() - 1), t.setDate(1), t.setHours(0, 0, 0, 0), s.setDate(0), s.setHours(23, 59, 59, 999);
        break;
    }
    return { from: t, to: s };
  }, I = (e) => {
    const o = E(e);
    if (d(o), f(!0), a) {
      const t = {
        from: new Date(o.from.getFullYear() - 1, o.from.getMonth(), o.from.getDate()),
        to: o.to ? new Date(o.to.getFullYear() - 1, o.to.getMonth(), o.to.getDate()) : void 0
      };
      m(t);
    }
  }, J = () => {
    for (const e of b) {
      const o = E(e.name), t = new Date(n.from);
      t.setHours(0, 0, 0, 0);
      const s = new Date(o.from.setHours(0, 0, 0, 0)), y = new Date(n.to ?? 0);
      y.setHours(0, 0, 0, 0);
      const P = new Date(o.to?.setHours(0, 0, 0, 0) ?? 0);
      if (t.getTime() === s.getTime() && y.getTime() === P.getTime()) {
        T(e.name);
        return;
      }
    }
    T(void 0);
  };
  O(() => {
    J();
  }, [n]);
  const K = ({
    preset: e,
    label: o,
    isSelected: t
  }) => /* @__PURE__ */ r(
    g,
    {
      className: $(t && "pointer-events-none"),
      variant: "ghost",
      onClick: () => {
        I(e);
      },
      children: /* @__PURE__ */ l(j, { children: [
        /* @__PURE__ */ r("span", { className: $("pr-2 opacity-0", t && "opacity-70"), children: /* @__PURE__ */ r(me, { width: 18, height: 18 }) }),
        o
      ] })
    }
  ), Y = (e, o) => !e || !o ? e === o : e.from.getTime() === o.from.getTime() && (!e.to || !o.to || e.to.getTime() === o.to.getTime()), Q = () => {
    d({ from: void 0, to: void 0 }), m(void 0), f(!1), T(void 0), h.current = !0, v(!1), F?.({ range: { from: void 0, to: void 0 }, rangeCompare: void 0 });
  };
  return /* @__PURE__ */ l(
    X,
    {
      modal: !0,
      open: L,
      onOpenChange: (e) => {
        e ? (R.current = n, S.current = a, M.current = N, h.current = !1) : (h.current || (d(R.current || n), m(S.current), f(M.current)), h.current = !1), v(e);
      },
      ...q,
      children: [
        /* @__PURE__ */ r(Z, { children: /* @__PURE__ */ l(g, { size: "lg", variant: "outline", children: [
          /* @__PURE__ */ l("div", { className: "text-right", children: [
            /* @__PURE__ */ r("div", { className: "py-1", children: N ? /* @__PURE__ */ r("div", { children: `${k(n.from, D)}${n.to != null ? " - " + k(n.to, D) : ""}` }) : /* @__PURE__ */ r("div", { children: A ?? "Select a date range" }) }),
            a != null && /* @__PURE__ */ r("div", { className: "opacity-60 text-xs -mt-1", children: /* @__PURE__ */ l(j, { children: [
              "vs. ",
              k(a.from, D),
              a.to != null ? ` - ${k(a.to, D)}` : ""
            ] }) })
          ] }),
          /* @__PURE__ */ r("div", { className: "pl-1 opacity-60 -mr-2 scale-125", children: L ? /* @__PURE__ */ r(ce, { width: 24 }) : /* @__PURE__ */ r(ie, { width: 24 }) })
        ] }) }),
        /* @__PURE__ */ l(_, { align: U, className: "w-auto", children: [
          /* @__PURE__ */ l("div", { className: "flex py-2", children: [
            /* @__PURE__ */ r("div", { className: "flex", children: /* @__PURE__ */ l("div", { className: "flex flex-col", children: [
              /* @__PURE__ */ l("div", { className: "flex flex-col lg:flex-row gap-2 px-3 justify-end items-center lg:items-start pb-4 lg:pb-0", children: [
                V && /* @__PURE__ */ l("div", { className: "flex items-center space-x-2 pr-4 py-1", children: [
                  /* @__PURE__ */ r(
                    le,
                    {
                      defaultChecked: !!a,
                      onCheckedChange: (e) => {
                        e ? (n.to || d((o) => ({
                          ...o,
                          to: o.from
                        })), m({
                          from: new Date(n.from.getFullYear(), n.from.getMonth(), n.from.getDate() - 365),
                          to: n.to ? new Date(n.to.getFullYear() - 1, n.to.getMonth(), n.to.getDate()) : new Date(n.from.getFullYear() - 1, n.from.getMonth(), n.from.getDate())
                        })) : m(void 0);
                      },
                      id: "compare-mode"
                    }
                  ),
                  /* @__PURE__ */ r(te, { htmlFor: "compare-mode", children: "Compare" })
                ] }),
                /* @__PURE__ */ l("div", { className: "flex flex-col gap-2", children: [
                  /* @__PURE__ */ l("div", { className: "flex gap-2", children: [
                    /* @__PURE__ */ r(
                      C,
                      {
                        value: n.from,
                        onChange: (e) => {
                          const o = n.to == null || e > n.to ? e : n.to;
                          d((t) => ({
                            ...t,
                            from: e,
                            to: o
                          })), f(!0);
                        }
                      }
                    ),
                    /* @__PURE__ */ r("div", { className: "py-1", children: "-" }),
                    /* @__PURE__ */ r(
                      C,
                      {
                        value: n.to,
                        onChange: (e) => {
                          const o = e < n.from ? e : n.from;
                          d((t) => ({
                            ...t,
                            from: o,
                            to: e
                          })), f(!0);
                        }
                      }
                    )
                  ] }),
                  a != null && /* @__PURE__ */ l("div", { className: "flex gap-2", children: [
                    /* @__PURE__ */ r(
                      C,
                      {
                        value: a?.from,
                        onChange: (e) => {
                          if (a) {
                            const o = a.to == null || e > a.to ? e : a.to;
                            m((t) => ({
                              ...t,
                              from: e,
                              to: o
                            }));
                          } else
                            m({
                              from: e,
                              to: /* @__PURE__ */ new Date()
                            });
                        }
                      }
                    ),
                    /* @__PURE__ */ r("div", { className: "py-1", children: "-" }),
                    /* @__PURE__ */ r(
                      C,
                      {
                        value: a?.to,
                        onChange: (e) => {
                          if (a && a.from) {
                            const o = e < a.from ? e : a.from;
                            m({
                              ...a,
                              from: o,
                              to: e
                            });
                          }
                        }
                      }
                    )
                  ] })
                ] })
              ] }),
              w && /* @__PURE__ */ l(
                oe,
                {
                  defaultValue: W,
                  onValueChange: (e) => {
                    I(e);
                  },
                  children: [
                    /* @__PURE__ */ r(re, { className: "w-[180px] mx-auto mb-2", children: /* @__PURE__ */ r(ne, { placeholder: "Select..." }) }),
                    /* @__PURE__ */ r(ae, { children: b.map((e) => /* @__PURE__ */ r(se, { value: e.name, children: e.label }, e.name)) })
                  ]
                }
              ),
              /* @__PURE__ */ r("div", { children: /* @__PURE__ */ r(
                ee,
                {
                  mode: "range",
                  onSelect: (e) => {
                    e?.from != null ? (d({ from: e.from, to: e?.to }), f(!0)) : f(!1);
                  },
                  selected: n,
                  numberOfMonths: w ? 1 : 2,
                  defaultMonth: new Date((/* @__PURE__ */ new Date()).setMonth((/* @__PURE__ */ new Date()).getMonth() - (w ? 0 : 1)))
                }
              ) })
            ] }) }),
            !w && /* @__PURE__ */ r("div", { className: "flex flex-col items-end gap-1 pr-2 pl-6 pb-6", children: /* @__PURE__ */ r("div", { className: "flex w-full flex-col items-end gap-1 pr-2 pl-6 pb-6", children: b.map((e) => /* @__PURE__ */ r(
              K,
              {
                preset: e.name,
                label: e.label,
                isSelected: W === e.name
              },
              e.name
            )) }) })
          ] }),
          /* @__PURE__ */ l("div", { className: "flex justify-end gap-2 py-2 pr-4", children: [
            /* @__PURE__ */ r(g, { onClick: Q, variant: "ghost", children: "Clear" }),
            /* @__PURE__ */ r(
              g,
              {
                onClick: () => {
                  v(!1);
                },
                variant: "ghost",
                children: "Cancel"
              }
            ),
            /* @__PURE__ */ r(
              g,
              {
                onClick: () => {
                  (!Y(n, R.current) || !Y(a, S.current) || N !== M.current) && F?.({ range: n, rangeCompare: a }), h.current = !0, v(!1);
                },
                children: "Update"
              }
            )
          ] })
        ] })
      ]
    }
  );
};
de.displayName = "DateRangePicker";
export {
  de as DateRangePicker
};
