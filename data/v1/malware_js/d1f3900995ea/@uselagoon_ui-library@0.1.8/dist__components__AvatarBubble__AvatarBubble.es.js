import { jsx as l } from "react/jsx-runtime";
import { cva as m } from "class-variance-authority";
import { cn as n } from "../../lib/utils.es.js";
const c = m("rounded-full h-6 w-6 min-w-[24px] flex justify-center items-center mr-2 text-xs");
function i({ bgColor: r, textColor: t, className: e, children: o, ...a }) {
  return /* @__PURE__ */ l("div", { ...a, className: n(c(), e), style: { backgroundColor: r, color: t }, children: o });
}
export {
  i as default
};
