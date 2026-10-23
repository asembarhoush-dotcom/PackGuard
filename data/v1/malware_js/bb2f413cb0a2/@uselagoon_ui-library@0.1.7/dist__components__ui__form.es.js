import { jsx as m } from "react/jsx-runtime";
import * as s from "react";
import { Slot as f } from "@radix-ui/react-slot";
import { FormProvider as u, useFormContext as F, useFormState as x, Controller as I } from "react-hook-form";
import { cn as a } from "../../lib/utils.es.js";
import { Label as g } from "./label.es.js";
const S = u, c = s.createContext({}), $ = ({
  ...e
}) => /* @__PURE__ */ m(c.Provider, { value: { name: e.name }, children: /* @__PURE__ */ m(I, { ...e }) }), d = () => {
  const e = s.useContext(c), t = s.useContext(l), { getFieldState: r } = F(), o = x({ name: e.name }), n = r(e.name, o);
  if (!e)
    throw new Error("useFormField should be used within <FormField>");
  const { id: i } = t;
  return {
    id: i,
    name: e.name,
    formItemId: `${i}-form-item`,
    formDescriptionId: `${i}-form-item-description`,
    formMessageId: `${i}-form-item-message`,
    ...n
  };
}, l = s.createContext({});
function D({ className: e, ...t }) {
  const r = s.useId();
  return /* @__PURE__ */ m(l.Provider, { value: { id: r }, children: /* @__PURE__ */ m("div", { "data-slot": "form-item", className: a("grid gap-2", e), ...t }) });
}
function M({ className: e, ...t }) {
  const { error: r, formItemId: o } = d();
  return /* @__PURE__ */ m(
    g,
    {
      "data-slot": "form-label",
      "data-error": !!r,
      className: a("data-[error=true]:text-destructive", e),
      htmlFor: o,
      ...t
    }
  );
}
function N({ ...e }) {
  const { error: t, formItemId: r, formDescriptionId: o, formMessageId: n } = d();
  return /* @__PURE__ */ m(
    f,
    {
      "data-slot": "form-control",
      id: r,
      "aria-describedby": t ? `${o} ${n}` : `${o}`,
      "aria-invalid": !!t,
      ...e
    }
  );
}
function w({ className: e, ...t }) {
  const { formDescriptionId: r } = d();
  return /* @__PURE__ */ m(
    "p",
    {
      "data-slot": "form-description",
      id: r,
      className: a("text-muted-foreground text-sm", e),
      ...t
    }
  );
}
function P({ className: e, ...t }) {
  const { error: r, formMessageId: o } = d(), n = r ? String(r?.message ?? "") : t.children;
  return n ? /* @__PURE__ */ m("p", { "data-slot": "form-message", id: o, className: a("text-destructive text-sm", e), ...t, children: n }) : null;
}
export {
  S as Form,
  N as FormControl,
  w as FormDescription,
  $ as FormField,
  D as FormItem,
  M as FormLabel,
  P as FormMessage,
  d as useFormField
};
