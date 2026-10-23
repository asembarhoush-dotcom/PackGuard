import { jsx as a, jsxs as h } from "react/jsx-runtime";
import * as l from "react";
import k from "embla-carousel-react";
import { ArrowLeft as z, ArrowRight as g } from "lucide-react";
import { cn as d } from "../../lib/utils.es.js";
import { Button as v } from "./button.es.js";
const N = l.createContext(null);
function m() {
  const o = l.useContext(N);
  if (!o)
    throw new Error("useCarousel must be used within a <Carousel />");
  return o;
}
function I({
  orientation: o = "horizontal",
  opts: r,
  setApi: t,
  plugins: s,
  className: c,
  children: i,
  ...u
}) {
  const [p, e] = k(
    {
      ...r,
      axis: o === "horizontal" ? "x" : "y"
    },
    s
  ), [b, w] = l.useState(!1), [S, y] = l.useState(!1), f = l.useCallback((n) => {
    n && (w(n.canScrollPrev()), y(n.canScrollNext()));
  }, []), x = l.useCallback(() => {
    e?.scrollPrev();
  }, [e]), C = l.useCallback(() => {
    e?.scrollNext();
  }, [e]), P = l.useCallback(
    (n) => {
      n.key === "ArrowLeft" ? (n.preventDefault(), x()) : n.key === "ArrowRight" && (n.preventDefault(), C());
    },
    [x, C]
  );
  return l.useEffect(() => {
    !e || !t || t(e);
  }, [e, t]), l.useEffect(() => {
    if (e)
      return f(e), e.on("reInit", f), e.on("select", f), () => {
        e?.off("select", f);
      };
  }, [e, f]), /* @__PURE__ */ a(
    N.Provider,
    {
      value: {
        carouselRef: p,
        api: e,
        opts: r,
        orientation: o || (r?.axis === "y" ? "vertical" : "horizontal"),
        scrollPrev: x,
        scrollNext: C,
        canScrollPrev: b,
        canScrollNext: S
      },
      children: /* @__PURE__ */ a(
        "div",
        {
          onKeyDownCapture: P,
          className: d("relative", c),
          role: "region",
          "aria-roledescription": "carousel",
          "data-slot": "carousel",
          ...u,
          children: i
        }
      )
    }
  );
}
function K({ className: o, ...r }) {
  const { carouselRef: t, orientation: s } = m();
  return /* @__PURE__ */ a("div", { ref: t, className: "overflow-hidden", "data-slot": "carousel-content", children: /* @__PURE__ */ a("div", { className: d("flex", s === "horizontal" ? "-ml-4" : "-mt-4 flex-col", o), ...r }) });
}
function L({ className: o, ...r }) {
  const { orientation: t } = m();
  return /* @__PURE__ */ a(
    "div",
    {
      role: "group",
      "aria-roledescription": "slide",
      "data-slot": "carousel-item",
      className: d("min-w-0 shrink-0 grow-0 basis-full", t === "horizontal" ? "pl-4" : "pt-4", o),
      ...r
    }
  );
}
function B({
  className: o,
  variant: r = "outline",
  size: t = "icon",
  ...s
}) {
  const { orientation: c, scrollPrev: i, canScrollPrev: u } = m();
  return /* @__PURE__ */ h(
    v,
    {
      "data-slot": "carousel-previous",
      variant: r,
      size: t,
      className: d(
        "absolute size-8 rounded-full",
        c === "horizontal" ? "top-1/2 -left-12 -translate-y-1/2" : "-top-12 left-1/2 -translate-x-1/2 rotate-90",
        o
      ),
      disabled: !u,
      onClick: i,
      ...s,
      children: [
        /* @__PURE__ */ a(z, {}),
        /* @__PURE__ */ a("span", { className: "sr-only", children: "Previous slide" })
      ]
    }
  );
}
function q({
  className: o,
  variant: r = "outline",
  size: t = "icon",
  ...s
}) {
  const { orientation: c, scrollNext: i, canScrollNext: u } = m();
  return /* @__PURE__ */ h(
    v,
    {
      "data-slot": "carousel-next",
      variant: r,
      size: t,
      className: d(
        "absolute size-8 rounded-full",
        c === "horizontal" ? "top-1/2 -right-12 -translate-y-1/2" : "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",
        o
      ),
      disabled: !u,
      onClick: i,
      ...s,
      children: [
        /* @__PURE__ */ a(g, {}),
        /* @__PURE__ */ a("span", { className: "sr-only", children: "Next slide" })
      ]
    }
  );
}
export {
  I as Carousel,
  K as CarouselContent,
  L as CarouselItem,
  q as CarouselNext,
  B as CarouselPrevious
};
