import { jsxs as h, jsx as e } from "react/jsx-runtime";
import * as m from "react";
import * as a from "@radix-ui/react-slider";
import { cn as n } from "../../lib/utils.es.js";
function g({
  className: l,
  defaultValue: r,
  value: t,
  min: o = 0,
  max: i = 100,
  ...s
}) {
  const d = m.useMemo(
    () => Array.isArray(t) ? t : Array.isArray(r) ? r : [o, i],
    [t, r, o, i]
  );
  return /* @__PURE__ */ h(
    a.Root,
    {
      "data-slot": "slider",
      defaultValue: r,
      value: t,
      min: o,
      max: i,
      className: n(
        "relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",
        l
      ),
      ...s,
      children: [
        /* @__PURE__ */ e(
          a.Track,
          {
            "data-slot": "slider-track",
            className: n(
              "bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"
            ),
            children: /* @__PURE__ */ e(
              a.Range,
              {
                "data-slot": "slider-range",
                className: n("bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full")
              }
            )
          }
        ),
        Array.from({ length: d.length }, (b, c) => /* @__PURE__ */ e(
          a.Thumb,
          {
            "data-slot": "slider-thumb",
            className: "border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          },
          c
        ))
      ]
    }
  );
}
export {
  g as Slider
};
