import { jsxs as r, jsx as e, Fragment as N } from "react/jsx-runtime";
import { useState as d } from "react";
import { Copy as k, EyeOff as u, Eye as m, Check as w } from "lucide-react";
import { cva as T } from "class-variance-authority";
import { Tooltip as h, TooltipTrigger as p, TooltipContent as g } from "../ui/tooltip.es.js";
const W = T("truncate transition-all duration-300", {
  variants: {
    type: {
      visible: "",
      hidden: "blur-sm select-none hover:blur-0 hover:select-text",
      hiddenWithIcon: "",
      alwaysHidden: "blur-sm select-none"
    },
    unblur: {
      true: "!blur-0 !select-text",
      false: ""
    }
  },
  compoundVariants: [
    {
      type: "hiddenWithIcon",
      unblur: !1,
      className: "blur-sm select-none"
    },
    {
      type: "hiddenWithIcon",
      unblur: !0,
      className: "!blur-0 !select-text"
    }
  ],
  defaultVariants: {
    type: "visible",
    unblur: !1
  }
}), F = ({
  text: a,
  width: o,
  fontSize: b = "14px",
  type: l = "visible",
  withToolTip: x = !1,
  iconOnly: s = !1
}) => {
  const [f, i] = d(!1), [t, v] = d(!1), y = () => {
    navigator.clipboard.writeText(a.toString());
  }, C = () => {
    y(), i(!0), setTimeout(() => i(!1), 3500);
  }, n = () => v(!t), c = {
    maxWidth: o ? typeof o == "number" ? `${o}px` : o : void 0,
    fontSize: b,
    width: s ? "max-content" : void 0
  };
  return /* @__PURE__ */ r("div", { className: "flex items-center justify-between w-full gap-2", style: c, children: [
    !s && /* @__PURE__ */ e("span", { className: W({ type: l, unblur: t }), style: { maxWidth: c.maxWidth }, children: x && t ? /* @__PURE__ */ r(h, { children: [
      /* @__PURE__ */ e(p, { asChild: !0, children: /* @__PURE__ */ e("span", { className: "truncate", children: a }) }),
      /* @__PURE__ */ e(g, { side: "bottom", children: /* @__PURE__ */ e("p", { children: a }) })
    ] }) : a }),
    /* @__PURE__ */ e("div", { className: "flex items-center gap-3", children: f ? /* @__PURE__ */ r("div", { className: "flex items-center gap-3", children: [
      /* @__PURE__ */ r(h, { children: [
        /* @__PURE__ */ e(p, { asChild: !0, children: /* @__PURE__ */ e(w, { className: "w-4 h-4 text-green-500" }) }),
        /* @__PURE__ */ e(g, { children: /* @__PURE__ */ e("span", { className: "truncate", children: "Copied!" }) })
      ] }),
      l === "hiddenWithIcon" && (t ? /* @__PURE__ */ e(
        u,
        {
          className: "w-4 h-4 ml-3 cursor-pointer text-muted-foreground hover:bg-gray-200 active:bg-gray-300",
          onClick: n
        }
      ) : /* @__PURE__ */ e(
        m,
        {
          className: "w-4 h-4 ml-3 cursor-pointer text-muted-foreground hover:bg-gray-200 active:bg-gray-300",
          onClick: n
        }
      ))
    ] }) : /* @__PURE__ */ r(N, { children: [
      /* @__PURE__ */ e(
        k,
        {
          className: "w-4 h-4 text-muted-foreground dark:hover:text-gray-100 hover:text-black transition-colors active:text-gray-300 cursor-pointer",
          "data-cy": "copy-button",
          onClick: C
        }
      ),
      l === "hiddenWithIcon" && (t ? /* @__PURE__ */ e(
        u,
        {
          className: "w-4 h-4 ml-3 cursor-pointer text-muted-foreground dark:hover:text-gray-100 hover:text-black transition-colors active:text-gray-300",
          onClick: n
        }
      ) : /* @__PURE__ */ e(
        m,
        {
          className: "w-4 h-4 ml-3 cursor-pointer text-muted-foreground dark:hover:text-gray-100 hover:text-black transition-colors active:text-gray-300",
          onClick: n
        }
      ))
    ] }) })
  ] });
};
export {
  F as default
};
