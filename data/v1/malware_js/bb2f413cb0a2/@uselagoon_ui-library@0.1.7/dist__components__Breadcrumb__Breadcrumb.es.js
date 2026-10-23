import { jsx as r, jsxs as c } from "react/jsx-runtime";
import { Fragment as x } from "react";
import { Breadcrumb as f, BreadcrumbList as g, BreadcrumbItem as y, BreadcrumbLink as b, BreadcrumbSeparator as v } from "../ui/breadcrumb.es.js";
import C from "../CopyToClipboard/CopyToClipboard.es.js";
import { ChevronRight as N } from "lucide-react";
const k = {
  default: ["", "project", "environment"],
  orgs: ["", "organization", "project"]
}, B = ({ activeKey: l, items: s, type: t, currentSlug: i }) => {
  const o = t && ["default", "orgs"].includes(t) ? [...k[t]] : null;
  return i && o && (o[2] = i), /* @__PURE__ */ r(f, { className: "mb-8 text-sm", "data-cy": "page-title", children: /* @__PURE__ */ r(g, { children: s.map((e, n) => {
    const d = "key" in e ? e.key : n, m = l && l === d, a = o?.[n] ?? null, u = "copyText" in e && e.copyText && a, p = e.copyText && e.copyText.length < 15 && a === "organization" ? "Org" : a, h = /* @__PURE__ */ c("div", { className: "relative flex flex-col items-start group", children: [
      p && /* @__PURE__ */ r("span", { className: "absolute -top-3 left-0 text-[11px] font-semibold uppercase text-primary pointer-events-none select-none", children: p }),
      /* @__PURE__ */ c("div", { className: "flex items-center gap-1", children: [
        /* @__PURE__ */ r("span", { className: m ? "text-foreground" : "text-muted-foreground", children: "navOnClick" in e && e.navOnClick ? /* @__PURE__ */ r("span", { onClick: e.navOnClick, className: "hover:underline cursor-pointer", children: e.title }) : e.title }),
        u && /* @__PURE__ */ r("div", { className: "text-primary scale-90 ml-1", children: /* @__PURE__ */ r(C, { text: e.copyText, iconOnly: !0 }) })
      ] })
    ] });
    return /* @__PURE__ */ c(x, { children: [
      /* @__PURE__ */ r(y, { children: /* @__PURE__ */ r(b, { asChild: !0, children: h }) }),
      n !== s.length - 1 && /* @__PURE__ */ r(v, { children: /* @__PURE__ */ r(N, { className: "w-4 h-4 text-muted-foreground" }) })
    ] }, d);
  }) }) });
};
B.displayName = "Breadcrumb";
export {
  B as default
};
