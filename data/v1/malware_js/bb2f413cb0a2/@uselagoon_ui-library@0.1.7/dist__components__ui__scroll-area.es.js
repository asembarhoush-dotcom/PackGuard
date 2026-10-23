import { jsxs as s, jsx as l } from "react/jsx-runtime";
import * as o from "@radix-ui/react-scroll-area";
import { cn as t } from "../../lib/utils.es.js";
function u({ className: e, children: r, ...a }) {
  return /* @__PURE__ */ s(o.Root, { "data-slot": "scroll-area", className: t("relative", e), ...a, children: [
    /* @__PURE__ */ l(
      o.Viewport,
      {
        "data-slot": "scroll-area-viewport",
        className: "focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1",
        children: r
      }
    ),
    /* @__PURE__ */ l(i, {}),
    /* @__PURE__ */ l(o.Corner, {})
  ] });
}
function i({
  className: e,
  orientation: r = "vertical",
  ...a
}) {
  return /* @__PURE__ */ l(
    o.ScrollAreaScrollbar,
    {
      "data-slot": "scroll-area-scrollbar",
      orientation: r,
      className: t(
        "flex touch-none p-px transition-colors select-none",
        r === "vertical" && "h-full w-2.5 border-l border-l-transparent",
        r === "horizontal" && "h-2.5 flex-col border-t border-t-transparent",
        e
      ),
      ...a,
      children: /* @__PURE__ */ l(
        o.ScrollAreaThumb,
        {
          "data-slot": "scroll-area-thumb",
          className: "bg-border relative flex-1 rounded-full"
        }
      )
    }
  );
}
export {
  u as ScrollArea,
  i as ScrollBar
};
