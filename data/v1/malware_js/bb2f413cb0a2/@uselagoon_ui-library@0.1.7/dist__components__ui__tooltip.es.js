import { jsx as i, jsxs as n } from "react/jsx-runtime";
import * as o from "@radix-ui/react-tooltip";
import { cn as d } from "../../lib/utils.es.js";
function l({ delayDuration: t = 0, ...r }) {
  return /* @__PURE__ */ i(o.Provider, { "data-slot": "tooltip-provider", delayDuration: t, ...r });
}
function p({ ...t }) {
  return /* @__PURE__ */ i(l, { children: /* @__PURE__ */ i(o.Root, { "data-slot": "tooltip", ...t }) });
}
function f({ ...t }) {
  return /* @__PURE__ */ i(o.Trigger, { "data-slot": "tooltip-trigger", ...t });
}
function c({
  className: t,
  sideOffset: r = 0,
  children: e,
  ...a
}) {
  return /* @__PURE__ */ i(o.Portal, { children: /* @__PURE__ */ n(
    o.Content,
    {
      "data-slot": "tooltip-content",
      sideOffset: r,
      className: d(
        "bg-primary text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md px-3 py-1.5 text-xs text-balance",
        t
      ),
      ...a,
      children: [
        e,
        /* @__PURE__ */ i(o.Arrow, { className: "bg-primary fill-primary z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]" })
      ]
    }
  ) });
}
export {
  p as Tooltip,
  c as TooltipContent,
  l as TooltipProvider,
  f as TooltipTrigger
};
