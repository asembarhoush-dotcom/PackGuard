import { jsx as e, Fragment as a, jsxs as i } from "react/jsx-runtime";
import { Checkbox as l } from "../ui/checkbox.es.js";
import { Label as m } from "../ui/label.es.js";
function c({ label: t, id: r, ...o }) {
  return /* @__PURE__ */ e(a, { children: /* @__PURE__ */ i("div", { className: "flex items-center gap-3", children: [
    /* @__PURE__ */ e(l, { id: r, ...o }),
    /* @__PURE__ */ e(m, { htmlFor: r, children: t })
  ] }) });
}
c.displayName = "CheckboxWithLabel";
export {
  c as default
};
