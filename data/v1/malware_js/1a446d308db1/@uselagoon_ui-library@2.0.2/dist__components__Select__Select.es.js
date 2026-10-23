import { jsxs as n, jsx as e } from "react/jsx-runtime";
import { Select as m, SelectTrigger as u, SelectValue as f, SelectContent as t, SelectGroup as x, SelectLabel as S, SelectItem as s } from "../ui/select.es.js";
function v(a) {
  return Array.isArray(a) && a.length > 0 && "options" in a[0];
}
function y({ placeholder: a, options: r, disabled: i, width: h, ...d }) {
  return /* @__PURE__ */ n(m, { disabled: i, ...d, children: [
    /* @__PURE__ */ e(u, { className: `w-[${h ?? "266px"}]`, children: /* @__PURE__ */ e(f, { placeholder: a || "Make a selection" }) }),
    !i && r && Array.isArray(r) && (r.length > 0 ? /* @__PURE__ */ e(t, { children: v(r) ? r.map((l) => /* @__PURE__ */ n(x, { children: [
      /* @__PURE__ */ e(S, { children: l.label }),
      l.options.map((c) => /* @__PURE__ */ e(s, { value: String(c.value), children: /* @__PURE__ */ n("div", { className: "flex items-center gap-2", children: [
        c.icon && /* @__PURE__ */ e("span", { className: "flex-shrink-0", children: c.icon }),
        /* @__PURE__ */ e("span", { children: c.label })
      ] }) }, c.value))
    ] }, l.label)) : r.map((l) => /* @__PURE__ */ e(s, { value: String(l.value), children: /* @__PURE__ */ n("div", { className: "flex items-center gap-2", children: [
      l.icon && /* @__PURE__ */ e("span", { className: "flex-shrink-0", children: l.icon }),
      /* @__PURE__ */ e("span", { children: l.label })
    ] }) }, l.value)) }) : /* @__PURE__ */ e(t, { className: "text-center text-muted-foreground", children: "No options" }))
  ] });
}
export {
  y as default
};
