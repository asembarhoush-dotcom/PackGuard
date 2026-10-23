import { jsxs as l, jsx as n } from "react/jsx-runtime";
import { AlertDialog as p, AlertDialogTrigger as D, AlertDialogContent as A, AlertDialogHeader as C, AlertDialogTitle as f, AlertDialogDescription as u, AlertDialogFooter as s, AlertDialogCancel as O, AlertDialogAction as m } from "../ui/alert-dialog.es.js";
function k({
  title: r,
  message: a,
  cancelText: t,
  onCancel: i,
  confirmText: c,
  confirmDisabled: d = !1,
  onConfirm: o,
  ...e
}) {
  const g = "open" in e && "onOpenChange" in e ? { open: e.open, onOpenChange: e.onOpenChange } : {};
  return /* @__PURE__ */ l(p, { ...g, children: [
    /* @__PURE__ */ n(D, { asChild: !0, children: "children" in e ? e.children : null }),
    /* @__PURE__ */ l(A, { children: [
      /* @__PURE__ */ l(C, { children: [
        /* @__PURE__ */ n(f, { children: r }),
        /* @__PURE__ */ n(u, { children: a })
      ] }),
      /* @__PURE__ */ l(s, { children: [
        /* @__PURE__ */ n(
          O,
          {
            onClick: () => {
              i && i();
            },
            children: t ?? "Cancel"
          }
        ),
        /* @__PURE__ */ n(
          m,
          {
            disabled: d,
            onClick: (h) => {
              "onOpenChange" in e && h.preventDefault(), o && o();
            },
            children: c ?? "Continue"
          }
        )
      ] })
    ] })
  ] });
}
export {
  k as default
};
