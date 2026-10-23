import { jsx as a, jsxs as d } from "react/jsx-runtime";
import * as n from "@radix-ui/react-menubar";
import { CheckIcon as u, CircleIcon as c, ChevronRightIcon as l } from "lucide-react";
import { cn as o } from "../../lib/utils.es.js";
function g({ className: e, ...t }) {
  return /* @__PURE__ */ a(
    n.Root,
    {
      "data-slot": "menubar",
      className: o("bg-background flex h-9 items-center gap-1 rounded-md border p-1 shadow-xs", e),
      ...t
    }
  );
}
function x({ ...e }) {
  return /* @__PURE__ */ a(n.Menu, { "data-slot": "menubar-menu", ...e });
}
function v({ ...e }) {
  return /* @__PURE__ */ a(n.Group, { "data-slot": "menubar-group", ...e });
}
function m({ ...e }) {
  return /* @__PURE__ */ a(n.Portal, { "data-slot": "menubar-portal", ...e });
}
function h({ ...e }) {
  return /* @__PURE__ */ a(n.RadioGroup, { "data-slot": "menubar-radio-group", ...e });
}
function M({ className: e, ...t }) {
  return /* @__PURE__ */ a(
    n.Trigger,
    {
      "data-slot": "menubar-trigger",
      className: o(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex items-center rounded-sm px-2 py-1 text-sm font-medium outline-hidden select-none",
        e
      ),
      ...t
    }
  );
}
function z({
  className: e,
  align: t = "start",
  alignOffset: r = -4,
  sideOffset: s = 8,
  ...i
}) {
  return /* @__PURE__ */ a(m, { children: /* @__PURE__ */ a(
    n.Content,
    {
      "data-slot": "menubar-content",
      align: t,
      alignOffset: r,
      sideOffset: s,
      className: o(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[12rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-md",
        e
      ),
      ...i
    }
  ) });
}
function N({
  className: e,
  inset: t,
  variant: r = "default",
  ...s
}) {
  return /* @__PURE__ */ a(
    n.Item,
    {
      "data-slot": "menubar-item",
      "data-inset": t,
      "data-variant": r,
      className: o(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        e
      ),
      ...s
    }
  );
}
function I({
  className: e,
  children: t,
  checked: r,
  ...s
}) {
  return /* @__PURE__ */ d(
    n.CheckboxItem,
    {
      "data-slot": "menubar-checkbox-item",
      className: o(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        e
      ),
      checked: r,
      ...s,
      children: [
        /* @__PURE__ */ a("span", { className: "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center", children: /* @__PURE__ */ a(n.ItemIndicator, { children: /* @__PURE__ */ a(u, { className: "size-4" }) }) }),
        t
      ]
    }
  );
}
function y({ className: e, children: t, ...r }) {
  return /* @__PURE__ */ d(
    n.RadioItem,
    {
      "data-slot": "menubar-radio-item",
      className: o(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        e
      ),
      ...r,
      children: [
        /* @__PURE__ */ a("span", { className: "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center", children: /* @__PURE__ */ a(n.ItemIndicator, { children: /* @__PURE__ */ a(c, { className: "size-2 fill-current" }) }) }),
        t
      ]
    }
  );
}
function k({
  className: e,
  inset: t,
  ...r
}) {
  return /* @__PURE__ */ a(
    n.Label,
    {
      "data-slot": "menubar-label",
      "data-inset": t,
      className: o("px-2 py-1.5 text-sm font-medium data-[inset]:pl-8", e),
      ...r
    }
  );
}
function _({ className: e, ...t }) {
  return /* @__PURE__ */ a(
    n.Separator,
    {
      "data-slot": "menubar-separator",
      className: o("bg-border -mx-1 my-1 h-px", e),
      ...t
    }
  );
}
function w({ className: e, ...t }) {
  return /* @__PURE__ */ a(
    "span",
    {
      "data-slot": "menubar-shortcut",
      className: o("text-muted-foreground ml-auto text-xs tracking-widest", e),
      ...t
    }
  );
}
function C({ ...e }) {
  return /* @__PURE__ */ a(n.Sub, { "data-slot": "menubar-sub", ...e });
}
function S({
  className: e,
  inset: t,
  children: r,
  ...s
}) {
  return /* @__PURE__ */ d(
    n.SubTrigger,
    {
      "data-slot": "menubar-sub-trigger",
      "data-inset": t,
      className: o(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none select-none data-[inset]:pl-8",
        e
      ),
      ...s,
      children: [
        r,
        /* @__PURE__ */ a(l, { className: "ml-auto h-4 w-4" })
      ]
    }
  );
}
function R({ className: e, ...t }) {
  return /* @__PURE__ */ a(
    n.SubContent,
    {
      "data-slot": "menubar-sub-content",
      className: o(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        e
      ),
      ...t
    }
  );
}
export {
  g as Menubar,
  I as MenubarCheckboxItem,
  z as MenubarContent,
  v as MenubarGroup,
  N as MenubarItem,
  k as MenubarLabel,
  x as MenubarMenu,
  m as MenubarPortal,
  h as MenubarRadioGroup,
  y as MenubarRadioItem,
  _ as MenubarSeparator,
  w as MenubarShortcut,
  C as MenubarSub,
  R as MenubarSubContent,
  S as MenubarSubTrigger,
  M as MenubarTrigger
};
