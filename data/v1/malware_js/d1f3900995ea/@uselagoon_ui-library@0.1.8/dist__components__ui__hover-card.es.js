import { jsx as o } from "react/jsx-runtime";
import * as r from "@radix-ui/react-hover-card";
import { cn as i } from "../../lib/utils.es.js";
function m({ ...t }) {
  return /* @__PURE__ */ o(r.Root, { "data-slot": "hover-card", ...t });
}
function l({ ...t }) {
  return /* @__PURE__ */ o(r.Trigger, { "data-slot": "hover-card-trigger", ...t });
}
function c({
  className: t,
  align: e = "center",
  sideOffset: a = 4,
  ...d
}) {
  return /* @__PURE__ */ o(r.Portal, { "data-slot": "hover-card-portal", children: /* @__PURE__ */ o(
    r.Content,
    {
      "data-slot": "hover-card-content",
      align: e,
      sideOffset: a,
      className: i(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden",
        t
      ),
      ...d
    }
  ) });
}
export {
  m as HoverCard,
  c as HoverCardContent,
  l as HoverCardTrigger
};
