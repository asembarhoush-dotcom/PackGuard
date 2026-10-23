import { jsx as r } from "react/jsx-runtime";
import * as o from "@radix-ui/react-progress";
import { cn as a } from "../../lib/utils.es.js";
function n({ className: t, value: l, ...s }) {
  return /* @__PURE__ */ r(
    o.Root,
    {
      "data-slot": "progress",
      className: a("bg-primary/20 relative h-2 w-full overflow-hidden rounded-full", t),
      ...s,
      children: /* @__PURE__ */ r(
        o.Indicator,
        {
          "data-slot": "progress-indicator",
          className: "bg-primary h-full w-full flex-1 transition-all",
          style: { transform: `translateX(-${100 - (l || 0)}%)` }
        }
      )
    }
  );
}
export {
  n as Progress
};
