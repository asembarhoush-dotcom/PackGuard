import { jsx as e, jsxs as n } from "react/jsx-runtime";
import * as o from "@radix-ui/react-alert-dialog";
import { cn as l } from "../../lib/utils.es.js";
import { buttonVariants as r } from "./button.es.js";
function u({ ...t }) {
  return /* @__PURE__ */ e(o.Root, { "data-slot": "alert-dialog", ...t });
}
function f({ ...t }) {
  return /* @__PURE__ */ e(o.Trigger, { "data-slot": "alert-dialog-trigger", ...t });
}
function i({ ...t }) {
  return /* @__PURE__ */ e(o.Portal, { "data-slot": "alert-dialog-portal", ...t });
}
function s({ className: t, ...a }) {
  return /* @__PURE__ */ e(
    o.Overlay,
    {
      "data-slot": "alert-dialog-overlay",
      className: l(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        t
      ),
      ...a
    }
  );
}
function m({ className: t, ...a }) {
  return /* @__PURE__ */ n(i, { children: [
    /* @__PURE__ */ e(s, {}),
    /* @__PURE__ */ e(
      o.Content,
      {
        "data-slot": "alert-dialog-content",
        className: l(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200 sm:max-w-lg",
          t
        ),
        ...a
      }
    )
  ] });
}
function p({ className: t, ...a }) {
  return /* @__PURE__ */ e(
    "div",
    {
      "data-slot": "alert-dialog-header",
      className: l("flex flex-col gap-2 text-center sm:text-left", t),
      ...a
    }
  );
}
function x({ className: t, ...a }) {
  return /* @__PURE__ */ e(
    "div",
    {
      "data-slot": "alert-dialog-footer",
      className: l("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", t),
      ...a
    }
  );
}
function A({ className: t, ...a }) {
  return /* @__PURE__ */ e(
    o.Title,
    {
      "data-slot": "alert-dialog-title",
      className: l("text-lg font-semibold", t),
      ...a
    }
  );
}
function D({
  className: t,
  ...a
}) {
  return /* @__PURE__ */ e(
    o.Description,
    {
      "data-slot": "alert-dialog-description",
      className: l("text-muted-foreground text-sm", t),
      ...a
    }
  );
}
function v({ className: t, ...a }) {
  return /* @__PURE__ */ e(o.Action, { className: l(r(), t), ...a });
}
function N({ className: t, ...a }) {
  return /* @__PURE__ */ e(o.Cancel, { className: l(r({ variant: "outline" }), t), ...a });
}
export {
  u as AlertDialog,
  v as AlertDialogAction,
  N as AlertDialogCancel,
  m as AlertDialogContent,
  D as AlertDialogDescription,
  x as AlertDialogFooter,
  p as AlertDialogHeader,
  s as AlertDialogOverlay,
  i as AlertDialogPortal,
  A as AlertDialogTitle,
  f as AlertDialogTrigger
};
