import { jsx as e, jsxs as i } from "react/jsx-runtime";
import * as o from "@radix-ui/react-context-menu";
import { CheckIcon as d, CircleIcon as u, ChevronRightIcon as c } from "lucide-react";
import { cn as s } from "../../lib/utils.es.js";
function x({ ...t }) {
  return /* @__PURE__ */ e(o.Root, { "data-slot": "context-menu", ...t });
}
function p({ ...t }) {
  return /* @__PURE__ */ e(o.Trigger, { "data-slot": "context-menu-trigger", ...t });
}
function g({ ...t }) {
  return /* @__PURE__ */ e(o.Group, { "data-slot": "context-menu-group", ...t });
}
function v({ ...t }) {
  return /* @__PURE__ */ e(o.Portal, { "data-slot": "context-menu-portal", ...t });
}
function b({ ...t }) {
  return /* @__PURE__ */ e(o.Sub, { "data-slot": "context-menu-sub", ...t });
}
function h({ ...t }) {
  return /* @__PURE__ */ e(o.RadioGroup, { "data-slot": "context-menu-radio-group", ...t });
}
function C({
  className: t,
  inset: n,
  children: a,
  ...r
}) {
  return /* @__PURE__ */ i(
    o.SubTrigger,
    {
      "data-slot": "context-menu-sub-trigger",
      "data-inset": n,
      className: s(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        t
      ),
      ...r,
      children: [
        a,
        /* @__PURE__ */ e(c, { className: "ml-auto" })
      ]
    }
  );
}
function z({ className: t, ...n }) {
  return /* @__PURE__ */ e(
    o.SubContent,
    {
      "data-slot": "context-menu-sub-content",
      className: s(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg",
        t
      ),
      ...n
    }
  );
}
function M({ className: t, ...n }) {
  return /* @__PURE__ */ e(o.Portal, { children: /* @__PURE__ */ e(
    o.Content,
    {
      "data-slot": "context-menu-content",
      className: s(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
        t
      ),
      ...n
    }
  ) });
}
function N({
  className: t,
  inset: n,
  variant: a = "default",
  ...r
}) {
  return /* @__PURE__ */ e(
    o.Item,
    {
      "data-slot": "context-menu-item",
      "data-inset": n,
      "data-variant": a,
      className: s(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        t
      ),
      ...r
    }
  );
}
function I({
  className: t,
  children: n,
  checked: a,
  ...r
}) {
  return /* @__PURE__ */ i(
    o.CheckboxItem,
    {
      "data-slot": "context-menu-checkbox-item",
      className: s(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        t
      ),
      checked: a,
      ...r,
      children: [
        /* @__PURE__ */ e("span", { className: "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center", children: /* @__PURE__ */ e(o.ItemIndicator, { children: /* @__PURE__ */ e(d, { className: "size-4" }) }) }),
        n
      ]
    }
  );
}
function _({
  className: t,
  children: n,
  ...a
}) {
  return /* @__PURE__ */ i(
    o.RadioItem,
    {
      "data-slot": "context-menu-radio-item",
      className: s(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        t
      ),
      ...a,
      children: [
        /* @__PURE__ */ e("span", { className: "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center", children: /* @__PURE__ */ e(o.ItemIndicator, { children: /* @__PURE__ */ e(u, { className: "size-2 fill-current" }) }) }),
        n
      ]
    }
  );
}
function y({
  className: t,
  inset: n,
  ...a
}) {
  return /* @__PURE__ */ e(
    o.Label,
    {
      "data-slot": "context-menu-label",
      "data-inset": n,
      className: s("text-foreground px-2 py-1.5 text-sm font-medium data-[inset]:pl-8", t),
      ...a
    }
  );
}
function k({ className: t, ...n }) {
  return /* @__PURE__ */ e(
    o.Separator,
    {
      "data-slot": "context-menu-separator",
      className: s("bg-border -mx-1 my-1 h-px", t),
      ...n
    }
  );
}
function S({ className: t, ...n }) {
  return /* @__PURE__ */ e(
    "span",
    {
      "data-slot": "context-menu-shortcut",
      className: s("text-muted-foreground ml-auto text-xs tracking-widest", t),
      ...n
    }
  );
}
export {
  x as ContextMenu,
  I as ContextMenuCheckboxItem,
  M as ContextMenuContent,
  g as ContextMenuGroup,
  N as ContextMenuItem,
  y as ContextMenuLabel,
  v as ContextMenuPortal,
  h as ContextMenuRadioGroup,
  _ as ContextMenuRadioItem,
  k as ContextMenuSeparator,
  S as ContextMenuShortcut,
  b as ContextMenuSub,
  z as ContextMenuSubContent,
  C as ContextMenuSubTrigger,
  p as ContextMenuTrigger
};
