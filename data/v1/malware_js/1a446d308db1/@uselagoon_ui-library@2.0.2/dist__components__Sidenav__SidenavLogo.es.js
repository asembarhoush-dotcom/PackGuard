import { jsx as o, Fragment as a } from "react/jsx-runtime";
import { useTheme as m } from "next-themes";
import r from "../../icons/sidebar/logo-dark.svg.es.js";
import { useLinkComponent as d } from "../../providers/NextLinkProvider.es.js";
import { useSyncTheme as g } from "../../hooks/useSyncTheme.es.js";
function x() {
  const { theme: n } = m();
  g();
  const t = d(), s = () => `/sidebar-icons/logo-${n}.svg`;
  return /* @__PURE__ */ o(a, { children: /* @__PURE__ */ o("section", { className: "flex items-center gap-1 pl-1", children: /* @__PURE__ */ o("div", { className: "aspect-square min-w-[280px] max-h-[50px] rounded-lg text-sidebar-primary-foreground size-16 p-2 mb-2", children: /* @__PURE__ */ o(t, { href: "/projects", className: "w-auto h-auto", children: (() => {
    const e = s();
    return /* @__PURE__ */ o(
      "img",
      {
        src: e.includes("undefined") ? r : e,
        alt: "Logo",
        onError: (c) => {
          const i = c.currentTarget;
          i.src = r;
        }
      }
    );
  })() }) }) }) });
}
export {
  x as default
};
