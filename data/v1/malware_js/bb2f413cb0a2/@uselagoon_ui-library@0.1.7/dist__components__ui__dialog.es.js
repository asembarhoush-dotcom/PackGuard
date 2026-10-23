import { jsx as a, jsxs as i } from "react/jsx-runtime";
import * as o from "@radix-ui/react-dialog";
import { XIcon as r } from "lucide-react";
import { cn as n } from "../../lib/utils.es.js";
function m({ ...t }) {
  return /* @__PURE__ */ a(o.Root, { "data-slot": "dialog", ...t });
}
function p({ ...t }) {
  return /* @__PURE__ */ a(o.Trigger, { "data-slot": "dialog-trigger", ...t });
}
function d({ ...t }) {
  return /* @__PURE__ */ a(o.Portal, { "data-slot": "dialog-portal", ...t });
}
function x({ ...t }) {
  return /* @__PURE__ */ a(o.Close, { "data-slot": "dialog-close", ...t });
}
function g({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    o.Overlay,
    {
      "data-slot": "dialog-overlay",
      className: n(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        t
      ),
      ...e
    }
  );
}
function v({
  className: t,
  children: e,
  showCloseButton: l = !0,
  ...s
}) {
  return /* @__PURE__ */ i(d, { "data-slot": "dialog-portal", children: [
    /* @__PURE__ */ a(g, {}),
    /* @__PURE__ */ i(
      o.Content,
      {
        "data-slot": "dialog-content",
        className: n(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          t
        ),
        ...s,
        children: [
          e,
          l && /* @__PURE__ */ i(
            o.Close,
            {
              "data-slot": "dialog-close",
              className: "ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
              children: [
                /* @__PURE__ */ a(r, {}),
                /* @__PURE__ */ a("span", { className: "sr-only", children: "Close" })
              ]
            }
          )
        ]
      }
    )
  ] });
}
function D({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    "div",
    {
      "data-slot": "dialog-header",
      className: n("flex flex-col gap-2 text-center sm:text-left", t),
      ...e
    }
  );
}
function b({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    "div",
    {
      "data-slot": "dialog-footer",
      className: n("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", t),
      ...e
    }
  );
}
function h({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    o.Title,
    {
      "data-slot": "dialog-title",
      className: n("text-lg leading-none font-semibold", t),
      ...e
    }
  );
}
function y({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    o.Description,
    {
      "data-slot": "dialog-description",
      className: n("text-muted-foreground text-sm", t),
      ...e
    }
  );
}
export {
  m as Dialog,
  x as DialogClose,
  v as DialogContent,
  y as DialogDescription,
  b as DialogFooter,
  D as DialogHeader,
  g as DialogOverlay,
  d as DialogPortal,
  h as DialogTitle,
  p as DialogTrigger
};
