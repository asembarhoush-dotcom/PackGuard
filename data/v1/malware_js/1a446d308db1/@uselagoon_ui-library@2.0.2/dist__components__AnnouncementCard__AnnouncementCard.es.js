import { jsxs as o, jsx as e } from "react/jsx-runtime";
import { useState as p } from "react";
import { Card as u, CardHeader as g, CardContent as h } from "../ui/card.es.js";
import { X as b, BotMessageSquare as x } from "lucide-react";
import { cn as N } from "../../lib/utils.es.js";
import { getLocalStorage as C, setLocalStorage as v } from "../../_util/helpers.es.js";
function j({
  title: r = "Latest Changes",
  description: a,
  ctaText: n = "See What's New",
  ctaUrl: t = "https://docs.lagoon.sh/releases/2.29.2/",
  // hardcoded for now, need a way to make this dynamic in the future
  openInNewTab: s = !0,
  onClose: l,
  className: i = "[background:#dae8fd] ![color:#387eda] [box-shadow:var(--badge-ring)]",
  defaultLogo: c = !1
}) {
  const [d, m] = p(C("promo-card-dismissed") !== !0), f = () => {
    m(!1), l?.(), v("promo-card-dismissed", !0, 30);
  };
  return d ? /* @__PURE__ */ o(u, { className: N("m-2 w-auto bg-[#737373]/20 gap-0  !p-4", i), children: [
    /* @__PURE__ */ e(
      "button",
      {
        onClick: f,
        className: "absolute right-6 top-6 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none",
        "aria-label": "Close announcement",
        children: /* @__PURE__ */ e(b, { className: "h-4 w-4" })
      }
    ),
    /* @__PURE__ */ e(g, { className: "relative pb-0 !px-3", children: /* @__PURE__ */ o("div", { className: "flex flex-row items-center gap-2", children: [
      c && /* @__PURE__ */ e(x, { className: "h-5 w-5 flex-shrink-0" }),
      r && /* @__PURE__ */ e("p", { className: "text-sm font-bold leading-[1.4]", children: r })
    ] }) }),
    /* @__PURE__ */ o(h, { className: `!px-3 ${a ? "pt-2 space-y-2" : ""}`, children: [
      /* @__PURE__ */ e("p", { className: "text-sm font-normal leading-[1.4]", children: a }),
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
  ] }) : null;
}
export {
  j as default
};
