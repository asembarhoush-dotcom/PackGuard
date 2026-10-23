import { jsx as e, jsxs as t } from "react/jsx-runtime";
import { HelpCircle as m, Frown as g, Meh as h, Smile as n } from "lucide-react";
import { HoverCard as u, HoverCardTrigger as f, HoverCardContent as p } from "../ui/hover-card.es.js";
import r from "../StatCard/StatCard.es.js";
const x = (l) => {
  if (l.skeleton)
    return /* @__PURE__ */ e("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 animate-pulse", children: Array.from({ length: 5 }).map((N, d) => /* @__PURE__ */ e("div", { className: "h-[80px] rounded-xl bg-muted" }, d)) });
  const { problems: c, critical: a, high: s, medium: i, low: o } = l;
  return /* @__PURE__ */ t("div", { className: "space-y-4", children: [
    /* @__PURE__ */ t("div", { className: "flex items-center gap-3 text-center mx-auto w-fit", children: [
      /* @__PURE__ */ e("div", { className: "shrink-0", children: a >= 1 ? /* @__PURE__ */ e(g, { className: "h-6 w-6 text-rose-500" }) : s >= 1 ? /* @__PURE__ */ e(h, { className: "h-6 w-6 text-orange-500" }) : i >= 1 || o >= 1 ? /* @__PURE__ */ e(n, { className: "h-6 w-6 text-green-500" }) : /* @__PURE__ */ e(n, { className: "h-6 w-6 text-green-500" }) }),
      /* @__PURE__ */ t("div", { className: "flex items-center gap-2 text-xl font-semibold", children: [
        /* @__PURE__ */ e("h2", { children: "At a glance" }),
        /* @__PURE__ */ t(u, { children: [
          /* @__PURE__ */ e(f, { asChild: !0, children: /* @__PURE__ */ e(m, { className: "h-4 w-4 text-muted-foreground cursor-pointer" }) }),
          /* @__PURE__ */ e(p, { className: "w-64 text-sm text-muted-foreground", children: "The summary of all the problems is shown here." })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ t("div", { className: "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4", children: [
      /* @__PURE__ */ e(r, { type: "default", title: "Problems", content: c }),
      /* @__PURE__ */ e(r, { type: "default", title: "Critical", content: a }),
      /* @__PURE__ */ e(r, { type: "default", title: "High", content: s }),
      /* @__PURE__ */ e(r, { type: "default", title: "Medium", content: i }),
      /* @__PURE__ */ e(r, { type: "default", title: "Low", content: o })
    ] })
  ] });
};
x.displayName = "LagoonProblemsOverview";
export {
  x as default
};
