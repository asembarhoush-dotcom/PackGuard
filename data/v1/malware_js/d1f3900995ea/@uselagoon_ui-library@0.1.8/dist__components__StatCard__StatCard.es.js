import { jsxs as e, jsx as a, Fragment as l } from "react/jsx-runtime";
import { Card as d, CardHeader as o, CardTitle as s, CardContent as i } from "../ui/card.es.js";
import { cva as m } from "class-variance-authority";
import { cn as c } from "../../lib/utils.es.js";
const f = m("max-w-[160px] border rounded-lg flex flex-col justify-center", {
  variants: {
    type: {
      default: "h-[108px]",
      withIcon: "h-[125px] gap-2 p-6",
      stat: "w-[370px] max-w-[370px] h-[140px] gap-3 p-5"
    }
  },
  defaultVariants: {
    type: "default"
  }
});
function u({ type: t = "default", title: n, content: r }) {
  return /* @__PURE__ */ e(d, { className: c(f({ type: t })), children: [
    /* @__PURE__ */ a(o, { children: /* @__PURE__ */ a(
      s,
      {
        className: t === "stat" ? "font-sans font-light text-sm leading-[1.4] tracking-normal" : "font-sans font-medium text-sm leading-[1.5] tracking-normal",
        children: n
      }
    ) }),
    /* @__PURE__ */ a(i, { children: t === "stat" ? /* @__PURE__ */ a("section", { className: "font-sans font-normal leading-[1.75] tracking-normal", children: r }) : t === "default" ? /* @__PURE__ */ a("p", { className: "text-2xl leading-normal font-bold ml-auto w-max", children: r }) : /* @__PURE__ */ a(l, { children: r }) })
  ] });
}
export {
  f as cardVariants,
  u as default
};
