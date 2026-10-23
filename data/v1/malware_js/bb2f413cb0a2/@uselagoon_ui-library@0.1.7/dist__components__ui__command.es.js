import { jsx as o, jsxs as d } from "react/jsx-runtime";
import { Command as n } from "cmdk";
import { SearchIcon as i } from "lucide-react";
import { cn as a } from "../../lib/utils.es.js";
import { Dialog as l, DialogHeader as u, DialogTitle as p, DialogDescription as g, DialogContent as f } from "./dialog.es.js";
function h({ className: e, ...t }) {
  return /* @__PURE__ */ o(
    n,
    {
      "data-slot": "command",
      className: a(
        "bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md",
        e
      ),
      ...t
    }
  );
}
function y({
  title: e = "Command Palette",
  description: t = "Search for a command to run...",
  children: r,
  className: m,
  showCloseButton: s = !0,
  ...c
}) {
  return /* @__PURE__ */ d(l, { ...c, children: [
    /* @__PURE__ */ d(u, { className: "sr-only", children: [
      /* @__PURE__ */ o(p, { children: e }),
      /* @__PURE__ */ o(g, { children: t })
    ] }),
    /* @__PURE__ */ o(f, { className: a("overflow-hidden p-0", m), showCloseButton: s, children: /* @__PURE__ */ o(h, { className: "[&_[cmdk-group-heading]]:text-muted-foreground **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5", children: r }) })
  ] });
}
function C({ className: e, ...t }) {
  return /* @__PURE__ */ d("div", { "data-slot": "command-input-wrapper", className: "flex h-9 items-center gap-2 border-b px-3", children: [
    /* @__PURE__ */ o(i, { className: "size-4 shrink-0 opacity-50" }),
    /* @__PURE__ */ o(
      n.Input,
      {
        "data-slot": "command-input",
        className: a(
          "placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
          e
        ),
        ...t
      }
    )
  ] });
}
function N({ className: e, ...t }) {
  return /* @__PURE__ */ o(
    n.List,
    {
      "data-slot": "command-list",
      className: a("max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto", e),
      ...t
    }
  );
}
function b({ ...e }) {
  return /* @__PURE__ */ o(n.Empty, { "data-slot": "command-empty", className: "py-6 text-center text-sm", ...e });
}
function D({ className: e, ...t }) {
  return /* @__PURE__ */ o(
    n.Group,
    {
      "data-slot": "command-group",
      className: a(
        "text-foreground [&_[cmdk-group-heading]]:text-muted-foreground overflow-hidden p-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium",
        e
      ),
      ...t
    }
  );
}
function I({ className: e, ...t }) {
  return /* @__PURE__ */ o(
    n.Separator,
    {
      "data-slot": "command-separator",
      className: a("bg-border -mx-1 h-px", e),
      ...t
    }
  );
}
function S({ className: e, ...t }) {
  return /* @__PURE__ */ o(
    n.Item,
    {
      "data-slot": "command-item",
      className: a(
        "data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        e
      ),
      ...t
    }
  );
}
function z({ className: e, ...t }) {
  return /* @__PURE__ */ o(
    "span",
    {
      "data-slot": "command-shortcut",
      className: a("text-muted-foreground ml-auto text-xs tracking-widest", e),
      ...t
    }
  );
}
export {
  h as Command,
  y as CommandDialog,
  b as CommandEmpty,
  D as CommandGroup,
  C as CommandInput,
  S as CommandItem,
  N as CommandList,
  I as CommandSeparator,
  z as CommandShortcut
};
