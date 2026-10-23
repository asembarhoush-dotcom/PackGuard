import { jsx as n, jsxs as l } from "react/jsx-runtime";
import { Accordion as a, AccordionItem as s, AccordionTrigger as m, AccordionContent as f } from "../ui/accordion.es.js";
import { cn as o } from "../../lib/utils.es.js";
function p({
  items: c,
  showArrows: i = !0,
  secondaryText: e = !1,
  showSeparators: t = !0,
  ...d
}) {
  return /* @__PURE__ */ n(a, { ...d, children: c.map((r) => /* @__PURE__ */ l(s, { value: r.id, className: o(!t && "border-none"), children: [
    /* @__PURE__ */ n(
      m,
      {
        className: o(
          "",
          !i && "[&>svg]:hidden underline hover:no-underline",
          e && "text-[#737373] font-normal"
        ),
        children: r.trigger
      }
    ),
    /* @__PURE__ */ n(f, { className: o("", e && "text-[#737373] font-normal"), children: r.content })
  ] }, r.id)) });
}
export {
  p as default
};
