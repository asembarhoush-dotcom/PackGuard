import { jsxs as r, jsx as s } from "react/jsx-runtime";
import { Label as p } from "../ui/label.es.js";
import { Switch as o } from "../ui/switch.es.js";
import { Loader2 as l } from "lucide-react";
function d({ id: a, label: t, description: c, disabled: i, loading: e, ...m }) {
  return /* @__PURE__ */ r("div", { className: "flex space-x-2", children: [
    /* @__PURE__ */ s(o, { id: a, disabled: i || e, ...m }),
    /* @__PURE__ */ r("div", { className: "space-y-2", children: [
      /* @__PURE__ */ s(p, { className: `pt-[3px] ${e ? "opacity-60" : ""}`, htmlFor: a, children: e ? /* @__PURE__ */ s(l, { className: "mr-2 h-4 w-4 animate-spin" }) : t }),
      /* @__PURE__ */ s("span", { className: `text-[#737373] ${e ? "opacity-60" : ""}`, children: c })
    ] })
  ] });
}
export {
  d as default
};
