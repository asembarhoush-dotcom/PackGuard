import { jsx as a, jsxs as o } from "react/jsx-runtime";
import { Drawer as e } from "vaul";
import { cn as d } from "../../lib/utils.es.js";
function s({ ...t }) {
  return /* @__PURE__ */ a(e.Root, { "data-slot": "drawer", ...t });
}
function m({ ...t }) {
  return /* @__PURE__ */ a(e.Trigger, { "data-slot": "drawer-trigger", ...t });
}
function n({ ...t }) {
  return /* @__PURE__ */ a(e.Portal, { "data-slot": "drawer-portal", ...t });
}
function f({ ...t }) {
  return /* @__PURE__ */ a(e.Close, { "data-slot": "drawer-close", ...t });
}
function l({ className: t, ...r }) {
  return /* @__PURE__ */ a(
    e.Overlay,
    {
      "data-slot": "drawer-overlay",
      className: d(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        t
      ),
      ...r
    }
  );
}
function v({ className: t, children: r, ...i }) {
  return /* @__PURE__ */ o(n, { "data-slot": "drawer-portal", children: [
    /* @__PURE__ */ a(l, {}),
    /* @__PURE__ */ o(
      e.Content,
      {
        "data-slot": "drawer-content",
        className: d(
          "group/drawer-content bg-background fixed z-50 flex h-auto flex-col",
          "data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-lg data-[vaul-drawer-direction=top]:border-b",
          "data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-lg data-[vaul-drawer-direction=bottom]:border-t",
          "data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=right]:sm:max-w-sm",
          "data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=left]:sm:max-w-sm",
          t
        ),
        ...i,
        children: [
          /* @__PURE__ */ a("div", { className: "bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[vaul-drawer-direction=bottom]/drawer-content:block" }),
          r
        ]
      }
    )
  ] });
}
function p({ className: t, ...r }) {
  return /* @__PURE__ */ a(
    "div",
    {
      "data-slot": "drawer-header",
      className: d(
        "flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left",
        t
      ),
      ...r
    }
  );
}
function g({ className: t, ...r }) {
  return /* @__PURE__ */ a("div", { "data-slot": "drawer-footer", className: d("mt-auto flex flex-col gap-2 p-4", t), ...r });
}
function x({ className: t, ...r }) {
  return /* @__PURE__ */ a(
    e.Title,
    {
      "data-slot": "drawer-title",
      className: d("text-foreground font-semibold", t),
      ...r
    }
  );
}
function b({ className: t, ...r }) {
  return /* @__PURE__ */ a(
    e.Description,
    {
      "data-slot": "drawer-description",
      className: d("text-muted-foreground text-sm", t),
      ...r
    }
  );
}
export {
  s as Drawer,
  f as DrawerClose,
  v as DrawerContent,
  b as DrawerDescription,
  g as DrawerFooter,
  p as DrawerHeader,
  l as DrawerOverlay,
  n as DrawerPortal,
  x as DrawerTitle,
  m as DrawerTrigger
};
