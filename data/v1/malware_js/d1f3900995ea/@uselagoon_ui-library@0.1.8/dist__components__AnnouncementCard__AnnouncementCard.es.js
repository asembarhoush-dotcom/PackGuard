import { jsxs as a, jsx as e } from "react/jsx-runtime";
import { useState as u } from "react";
import { Card as g, CardHeader as h, CardContent as b } from "../ui/card.es.js";
import { X as x, BotMessageSquare as N } from "lucide-react";
import { cn as C } from "../../lib/utils.es.js";
import { getLocalStorage as v, setLocalStorage as k } from "../../_util/helpers.es.js";
function V({
  title: o = "Latest Changes",
  description: r,
  ctaText: n = "See What's New",
  ctaUrl: t = "https://docs.lagoon.sh/releases/2.30.0/",
  // hardcoded for now, need a way to make this dynamic in the future
  openInNewTab: s = !0,
  onClose: l,
  className: i = "[background:#dae8fd] ![color:#387eda] [box-shadow:var(--badge-ring)]",
  defaultLogo: c = !1,
  disabled: d = !1
}) {
  const [m, f] = u(v("promo-card-dismissed") !== !0), p = () => {
    f(!1), l?.(), k("promo-card-dismissed", !0, 30);
  };
  return !m || d ? null : /* @__PURE__ */ a(g, { className: C("m-2 w-auto bg-[#737373]/20 gap-0  !p-4", i), children: [
    /* @__PURE__ */ e(
      "button",
      {
        onClick: p,
        className: "absolute right-6 top-6 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none",
        "aria-label": "Close announcement",
        children: /* @__PURE__ */ e(x, { className: "h-4 w-4" })
      }
    ),
    /* @__PURE__ */ e(h, { className: "relative pb-0 !px-3", children: /* @__PURE__ */ a("div", { className: "flex flex-row items-center gap-2", children: [
      c && /* @__PURE__ */ e(N, { className: "h-5 w-5 flex-shrink-0" }),
      o && /* @__PURE__ */ e("p", { className: "text-sm font-bold leading-[1.4]", children: o })
    ] }) }),
    /* @__PURE__ */ a(b, { className: `!px-3 ${r ? "pt-2 space-y-2" : ""}`, children: [
      /* @__PURE__ */ e("p", { className: "text-sm font-normal leading-[1.4]", children: r }),
      /* @__PURE__ */ e(
        "a",
        {
          href: t,
          target: s ? "_blank" : void 0,
          rel: s ? "noopener noreferrer" : void 0,
          className: "text-sm font-normal underline hover:no-underline promo-link__ai",
          children: n
        }
      )
    ] })
  ] });
}
export {
  V as default
};
