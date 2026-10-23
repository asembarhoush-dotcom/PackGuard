import { jsxs as i, jsx as r } from "react/jsx-runtime";
import { useState as x, useRef as T, useMemo as O, useEffect as g } from "react";
import { Label as R } from "../ui/label.es.js";
import { Sheet as U, SheetTrigger as W, SheetContent as A, SheetHeader as B, SheetTitle as H, SheetDescription as M, SheetFooter as z, SheetClose as G } from "../ui/sheet.es.js";
import { Button as v } from "../ui/button.es.js";
import { Input as J } from "../ui/input.es.js";
import K from "../Checkbox/Checkbox.es.js";
import P from "../Select/Select.es.js";
import { Loader2 as Q } from "lucide-react";
function ne({
  sheetTrigger: w = "Open",
  sheetTitle: E = "",
  sheetDescription: V = "",
  sheetFooterButton: D = "Save changes",
  buttonAction: I = () => {
  },
  sheetFields: s,
  loading: o = !1,
  additionalContent: j = null,
  error: h = !1,
  onFieldChange: y,
  ...q
}) {
  const [l, p] = x(!1), [S, m] = x({}), C = T(o), f = O(() => () => {
    const e = {};
    return s.forEach((t) => {
      t.inputDefault !== void 0 && (e[t.id] = t.inputDefault);
    }), e;
  }, [s]), [c, b] = x(f), F = (e) => {
    const t = {};
    return s.forEach((a) => {
      if (a.validate) {
        const n = a.validate(e[a.id]);
        n && (t[a.id] = n);
      }
    }), t;
  }, k = O(() => s.some((t) => {
    if (t.required)
      switch (t.type ?? "text") {
        case "checkbox":
          return c[t.id] !== !0;
        case "select":
        case "textarea":
        case "text":
        case "email":
        case "number":
        case "password":
        case "tel":
          return !c[t.id];
        default:
          return !1;
      }
    return !1;
  }) || o, [s, c, o]), d = (e, t) => {
    const a = {
      ...c,
      [e]: t
    };
    b(a), s.find((u) => u.id === e)?.triggerFieldUpdate && y && y(e, t, a);
  }, L = async (e) => {
    if (k) return;
    const t = F(c);
    if (m(t), !(Object.keys(t).length > 0))
      try {
        await I(e, c) !== !1 && !o && !h && setTimeout(() => p(!1));
      } catch (a) {
        console.error("Error in button action:", a);
      }
  };
  return g(() => {
    l && (b(f()), m({}));
  }, [l, f]), g(() => {
    C.current === !0 && o === !1 && l && !h && p(!1), C.current = o;
  }, [o, l, h]), g(() => {
    const e = s.map((n) => n.id), t = Object.keys(c), a = { ...c };
    t.forEach((n) => {
      e.includes(n) || delete a[n];
    }), s.forEach((n) => {
      n.inputDefault !== void 0 && !(n.id in a) && (a[n.id] = n.inputDefault);
    }), b(a), m((n) => {
      const u = { ...n };
      return Object.keys(u).forEach((N) => {
        e.includes(N) || delete u[N];
      }), u;
    });
  }, [s]), /* @__PURE__ */ i(U, { open: l, onOpenChange: p, ...q, children: [
    /* @__PURE__ */ r(W, { asChild: !0, children: /* @__PURE__ */ r(v, { children: w }) }),
    /* @__PURE__ */ i(A, { className: "flex flex-col h-full", children: [
      /* @__PURE__ */ i(B, { children: [
        /* @__PURE__ */ r(H, { children: E }),
        /* @__PURE__ */ r(M, { children: V })
      ] }),
      /* @__PURE__ */ i("div", { className: "flex flex-col gap-4 overflow-y-auto", children: [
        s.map((e) => /* @__PURE__ */ r("div", { className: "grid auto-rows-min gap-6 px-4", children: /* @__PURE__ */ i("div", { className: "grid gap-3", children: [
          e.type !== "checkbox" && /* @__PURE__ */ i(R, { htmlFor: e.id, children: [
            e.label,
            e.required && /* @__PURE__ */ r("span", { className: "text-red-500 ml-1", children: "*" })
          ] }),
          (() => {
            switch (e.type) {
              case "checkbox":
                return /* @__PURE__ */ r("div", { className: "flex items-center space-x-2", children: /* @__PURE__ */ r(
                  K,
                  {
                    label: e.label,
                    id: e.id,
                    checked: c[e.id] === !0 || c[e.id] === "true",
                    onCheckedChange: (t) => d(e.id, t)
                  }
                ) });
              case "textarea":
                return /* @__PURE__ */ r(
                  "textarea",
                  {
                    id: e.id,
                    className: "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    value: c[e.id] || "",
                    onChange: (t) => d(e.id, t.target.value),
                    placeholder: e?.placeholder,
                    readOnly: e.readOnly
                  }
                );
              case "select":
                return /* @__PURE__ */ r(
                  P,
                  {
                    placeholder: e?.placeholder || "",
                    options: e?.options || [],
                    value: c[e.id] || "",
                    onValueChange: (t) => d(e.id, t)
                  }
                );
              default:
                return /* @__PURE__ */ r(
                  J,
                  {
                    type: e?.type || "text",
                    id: e.id,
                    value: c[e.id] || "",
                    onChange: (t) => d(e.id, t.target.value),
                    placeholder: e?.placeholder,
                    readOnly: e.readOnly
                  }
                );
            }
          })(),
          S[e.id] && /* @__PURE__ */ r("p", { className: "text-sm text-red-500", children: S[e.id] })
        ] }) }, e.id)),
        /* @__PURE__ */ r("section", { className: "px-4", children: j })
      ] }),
      /* @__PURE__ */ i(z, { children: [
        /* @__PURE__ */ i(v, { onClick: L, disabled: k, children: [
          o && /* @__PURE__ */ r(Q, { className: "mr-2 h-4 w-4 animate-spin" }),
          D
        ] }),
        /* @__PURE__ */ r(G, { asChild: !0, children: /* @__PURE__ */ r(v, { variant: "outline", children: "Close" }) })
      ] })
    ] })
  ] });
}
export {
  ne as default
};
