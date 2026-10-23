import { jsx as n } from "react/jsx-runtime";
import * as d from "react";
import * as s from "@radix-ui/react-toggle-group";
import { cn as l } from "../../lib/utils.es.js";
import { toggleVariants as m } from "./toggle.es.js";
const u = d.createContext({
  size: "default",
  variant: "default"
});
function p({
  className: a,
  variant: o,
  size: t,
  children: e,
  ...i
}) {
  return /* @__PURE__ */ n(
    s.Root,
    {
      "data-slot": "toggle-group",
      "data-variant": o,
      "data-size": t,
      className: l(
        "group/toggle-group flex w-fit items-center rounded-md data-[variant=outline]:shadow-xs",
        a
      ),
      ...i,
      children: /* @__PURE__ */ n(u.Provider, { value: { variant: o, size: t }, children: e })
    }
  );
}
function v({
  className: a,
  children: o,
  variant: t,
  size: e,
  ...i
}) {
  const r = d.useContext(u);
  return /* @__PURE__ */ n(
    s.Item,
    {
      "data-slot": "toggle-group-item",
      "data-variant": r.variant || t,
      "data-size": r.size || e,
      className: l(
        m({
          variant: r.variant || t,
          size: r.size || e
        }),
        "min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10 focus-visible:z-10 data-[variant=outline]:border-l-0 data-[variant=outline]:first:border-l",
        a
      ),
      ...i,
      children: o
    }
  );
}
export {
  p as ToggleGroup,
  v as ToggleGroupItem
};
