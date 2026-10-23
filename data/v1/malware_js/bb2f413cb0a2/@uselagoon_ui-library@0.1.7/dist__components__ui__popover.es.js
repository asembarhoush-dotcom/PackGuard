import { jsx as t } from "react/jsx-runtime";
import * as e from "@radix-ui/react-popover";
import { cn as i } from "../../lib/utils.es.js";
function s({ ...o }) {
  return /* @__PURE__ */ t(e.Root, { "data-slot": "popover", ...o });
}
function m({ ...o }) {
  return /* @__PURE__ */ t(e.Trigger, { "data-slot": "popover-trigger", ...o });
}
function f({
  className: o,
  align: r = "center",
  sideOffset: a = 4,
  ...n
}) {
  return /* @__PURE__ */ t(e.Portal, { children: /* @__PURE__ */ t(
    e.Content,
    {
      "data-slot": "popover-content",
      align: r,
      sideOffset: a,
      className: i(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
        o
      ),
      ...n
    }
  ) });
}
function l({ ...o }) {
  return /* @__PURE__ */ t(e.Anchor, { "data-slot": "popover-anchor", ...o });
}
export {
  s as Popover,
  l as PopoverAnchor,
  f as PopoverContent,
  m as PopoverTrigger
};
