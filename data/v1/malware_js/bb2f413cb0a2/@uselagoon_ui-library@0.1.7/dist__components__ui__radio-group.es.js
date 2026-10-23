import { jsx as r } from "react/jsx-runtime";
import * as a from "@radix-ui/react-radio-group";
import { CircleIcon as t } from "lucide-react";
import { cn as e } from "../../lib/utils.es.js";
function l({ className: i, ...o }) {
  return /* @__PURE__ */ r(a.Root, { "data-slot": "radio-group", className: e("grid gap-3", i), ...o });
}
function c({ className: i, ...o }) {
  return /* @__PURE__ */ r(
    a.Item,
    {
      "data-slot": "radio-group-item",
      className: e(
        "border-input text-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        i
      ),
      ...o,
      children: /* @__PURE__ */ r(
        a.Indicator,
        {
          "data-slot": "radio-group-indicator",
          className: "relative flex items-center justify-center",
          children: /* @__PURE__ */ r(t, { className: "fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2" })
        }
      )
    }
  );
}
export {
  l as RadioGroup,
  c as RadioGroupItem
};
