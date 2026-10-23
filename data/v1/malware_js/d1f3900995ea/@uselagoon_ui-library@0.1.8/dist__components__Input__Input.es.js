import { jsxs as n, jsx as e } from "react/jsx-runtime";
import { Label as p } from "../ui/label.es.js";
import { Input as g } from "../ui/input.es.js";
import s, { forwardRef as w } from "react";
import { cva as I } from "class-variance-authority";
import { Loader2 as $ } from "lucide-react";
const h = I("w-full rounded-lg bg-background", {
  variants: {
    hasIcon: {
      true: "pl-8",
      false: ""
    }
  }
});
function F({ label: t = "", placeholder: o = "", icon: r, description: a, ...u }) {
  return /* @__PURE__ */ n("div", { className: "grid w-full max-w-sm items-center gap-1.5", children: [
    /* @__PURE__ */ e(p, { htmlFor: `${t}-input`, children: t }),
    /* @__PURE__ */ n("div", { className: "relative", children: [
      r && /* @__PURE__ */ e("div", { className: "absolute left-2.5 top-1.5 h-2.5 w-2.5 text-muted-foreground", children: r }),
      /* @__PURE__ */ e(
        g,
        {
          className: h({ hasIcon: !!r }),
          id: `${t}-input`,
          placeholder: o,
          ...u
        }
      ),
      a && /* @__PURE__ */ e("p", { className: "font-sans font-normal text-sm leading-[1.5] tracking-[0%] text-muted-foreground", children: a })
    ] })
  ] });
}
const R = w(
  ({ value: t, onChange: o, debounce: r = 500, label: a, placeholder: u = "", icon: m, description: i, ...v }, x) => {
    const [l, c] = s.useState(t), [N, f] = s.useState(!1);
    return s.useEffect(() => {
      c(t);
    }, [t]), s.useEffect(() => {
      f(!0);
      const d = setTimeout(() => {
        o(String(l)), f(!1);
      }, r);
      return () => clearTimeout(d);
    }, [l]), /* @__PURE__ */ n("div", { className: "grid w-full max-w-sm items-center gap-1.5", children: [
      /* @__PURE__ */ e(p, { htmlFor: `${a}-input`, children: a }),
      /* @__PURE__ */ n("div", { className: "relative", children: [
        m && /* @__PURE__ */ e("div", { className: "absolute left-2.5 top-1.5 h-2.5 w-2.5 text-muted-foreground", children: m }),
        N && /* @__PURE__ */ e($, { className: "absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" }),
        /* @__PURE__ */ e(
          g,
          {
            ...v,
            ref: x,
            className: h({ hasIcon: !!m }),
            id: `${a}-input`,
            placeholder: u,
            value: l,
            onChange: (d) => c(d.target.value)
          }
        ),
        i && /* @__PURE__ */ e("p", { className: "font-sans font-normal text-sm leading-[1.5] tracking-[0%] text-muted-foreground", children: i })
      ] })
    ] });
  }
);
export {
  R as DebouncedInput,
  F as default
};
