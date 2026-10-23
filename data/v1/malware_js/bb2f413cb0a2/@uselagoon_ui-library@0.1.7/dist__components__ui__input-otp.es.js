import { jsx as e, jsxs as u } from "react/jsx-runtime";
import * as c from "react";
import { OTPInput as l, OTPInputContext as p } from "input-otp";
import { MinusIcon as m } from "lucide-react";
import { cn as a } from "../../lib/utils.es.js";
function g({
  className: t,
  containerClassName: r,
  ...i
}) {
  return /* @__PURE__ */ e(
    l,
    {
      "data-slot": "input-otp",
      containerClassName: a("flex items-center gap-2 has-disabled:opacity-50", r),
      className: a("disabled:cursor-not-allowed", t),
      ...i
    }
  );
}
function h({ className: t, ...r }) {
  return /* @__PURE__ */ e("div", { "data-slot": "input-otp-group", className: a("flex items-center", t), ...r });
}
function I({
  index: t,
  className: r,
  ...i
}) {
  const n = c.useContext(p), { char: o, hasFakeCaret: s, isActive: d } = n?.slots[t] ?? {};
  return /* @__PURE__ */ u(
    "div",
    {
      "data-slot": "input-otp-slot",
      "data-active": d,
      className: a(
        "data-[active=true]:border-ring data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:ring-destructive/20 dark:data-[active=true]:aria-invalid:ring-destructive/40 aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive dark:bg-input/30 border-input relative flex h-9 w-9 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:ring-[3px]",
        r
      ),
      ...i,
      children: [
        o,
        s && /* @__PURE__ */ e("div", { className: "pointer-events-none absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ e("div", { className: "animate-caret-blink bg-foreground h-4 w-px duration-1000" }) })
      ]
    }
  );
}
function O({ ...t }) {
  return /* @__PURE__ */ e("div", { "data-slot": "input-otp-separator", role: "separator", ...t, children: /* @__PURE__ */ e(m, {}) });
}
export {
  g as InputOTP,
  h as InputOTPGroup,
  O as InputOTPSeparator,
  I as InputOTPSlot
};
