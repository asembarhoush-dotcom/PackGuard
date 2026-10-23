import { jsx as n } from "react/jsx-runtime";
import { isValidElement as m } from "react";
import l from "../StatCard/StatCard.es.js";
import { cva as f } from "class-variance-authority";
const p = f("font-sans font-normal text-lg leading-normal tracking-normal text-right", {
  variants: {
    transform: {
      lowercase: "lowercase",
      capitalize: "capitalize",
      none: ""
    }
  },
  defaultVariants: {
    transform: "none"
  }
});
function s(t) {
  return t.toLowerCase().replace(/\s+/g, "-");
}
const y = ({ title: t, value: a, lowercaseValue: e, capitalizeValue: o }) => {
  const i = m(a);
  let r = "";
  e && (r = "lowercase"), o && (r = "capitalize");
  const c = i ? /* @__PURE__ */ n("div", { className: r, "data-cy": s(t), children: a }) : /* @__PURE__ */ n(
    "span",
    {
      className: p({
        transform: e ? "lowercase" : o ? "capitalize" : "none"
      }),
      "data-cy": s(t),
      children: a
    }
  );
  return /* @__PURE__ */ n(l, { type: "stat", title: t, content: c });
};
export {
  y as default
};
