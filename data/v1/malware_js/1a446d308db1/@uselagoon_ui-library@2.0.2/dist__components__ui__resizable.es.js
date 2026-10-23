import { jsx as a } from "react/jsx-runtime";
import { GripVerticalIcon as n } from "lucide-react";
import * as t from "react-resizable-panels";
import { cn as i } from "../../lib/utils.es.js";
function d({ className: e, ...r }) {
  return /* @__PURE__ */ a(
    t.PanelGroup,
    {
      "data-slot": "resizable-panel-group",
      className: i("flex h-full w-full data-[panel-group-direction=vertical]:flex-col", e),
      ...r
    }
  );
}
function f({ ...e }) {
  return /* @__PURE__ */ a(t.Panel, { "data-slot": "resizable-panel", ...e });
}
function p({
  withHandle: e,
  className: r,
  ...l
}) {
  return /* @__PURE__ */ a(
    t.PanelResizeHandle,
    {
      "data-slot": "resizable-handle",
      className: i(
        "bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90",
        r
      ),
      ...l,
      children: e && /* @__PURE__ */ a("div", { className: "bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border", children: /* @__PURE__ */ a(n, { className: "size-2.5" }) })
    }
  );
}
export {
  p as ResizableHandle,
  f as ResizablePanel,
  d as ResizablePanelGroup
};
