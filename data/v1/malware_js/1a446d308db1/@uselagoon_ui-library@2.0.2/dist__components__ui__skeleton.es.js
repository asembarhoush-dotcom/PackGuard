import { jsx as o } from "react/jsx-runtime";
import { cn as n } from "../../lib/utils.es.js";
function m({ className: e, ...t }) {
  return /* @__PURE__ */ o("div", { "data-slot": "skeleton", className: n("bg-accent animate-pulse rounded-md", e), ...t });
}
export {
  m as Skeleton
};
