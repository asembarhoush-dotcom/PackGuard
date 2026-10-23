import { jsx as e } from "react/jsx-runtime";
import * as t from "@radix-ui/react-switch";
import { cn as a } from "../../lib/utils.es.js";
function s({ className: r, ...n }) {
  return /* @__PURE__ */ e(
    t.Root,
    {
      "data-slot": "switch",
      className: a(
        "peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
        r
      ),
      ...n,
      children: /* @__PURE__ */ e(
        t.Thumb,
        {
          "data-slot": "switch-thumb",
          className: a(
            "bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0"
          )
        }
      )
    }
  );
}
export {
  s as Switch
};
