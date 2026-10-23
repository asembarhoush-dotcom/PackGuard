import { jsx as e, jsxs as a, Fragment as c } from "react/jsx-runtime";
import { Badge as d } from "../ui/badge.es.js";
import i from "../Accordion/Accordion.es.js";
import { useMemo as f } from "react";
function y({ date: m, id: l, tags: r, description: t, title: n }) {
  const s = f(() => !r || r.length === 0 ? null : r.map((o) => /* @__PURE__ */ e(d, { className: "mr-2", children: o }, o)), [r]);
  return /* @__PURE__ */ a("div", { className: "flex", children: [
    /* @__PURE__ */ a("div", { className: "flex flex-col mr-6 items-center", children: [
      /* @__PURE__ */ e("div", { className: "border-2 border-gray-600 dark:border-gray-300 rounded-full h-4 w-4" }),
      /* @__PURE__ */ e("div", { className: "flex-1 border-l-2 border-gray-300 dark:border-gray-600" })
    ] }),
    /* @__PURE__ */ a("div", { className: "mb-4", children: [
      /* @__PURE__ */ e("p", { className: "text-gray-500 dark:text-gray-200 text-xs font-semibold", children: m }),
      /* @__PURE__ */ e(i, { defaultValue: [l], className: "[&_*]:justify-normal", type: "multiple", items: [{
        id: l,
        trigger: /* @__PURE__ */ e("h2", { className: "text-l font-semibold", children: n }),
        content: /* @__PURE__ */ a(c, { children: [
          t && /* @__PURE__ */ e("p", { className: "mb-6 text-gray-600 dark:text-gray-200", children: t }),
          s
        ] })
      }] })
    ] }, l)
  ] });
}
export {
  y as default
};
