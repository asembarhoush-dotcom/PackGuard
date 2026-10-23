import { jsx as t, jsxs as r } from "react/jsx-runtime";
import o from "../StatCard/StatCard.es.js";
function m({ name: e, category: n, value: a, img: s }) {
  return /* @__PURE__ */ t(o, { type: "withIcon", title: n, content: /* @__PURE__ */ r("section", { className: "flex-row justify-items-end font-sans font-normal text-xs leading-[1.25] tracking-normal text-right", children: [
    s,
    /* @__PURE__ */ t("span", { className: "name", children: e }),
    /* @__PURE__ */ t("br", {}),
    /* @__PURE__ */ t("span", { className: "value", children: a })
  ] }) });
}
export {
  m as default
};
