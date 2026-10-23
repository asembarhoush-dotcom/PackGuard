import { jsx as e, jsxs as n } from "react/jsx-runtime";
import { SidebarProvider as d } from "../ui/sidebar.es.js";
import f from "../Sidenav/Sidenav.es.js";
import u from "../../providers/ThemeProvider.es.js";
function v({
  userInfo: r,
  appInfo: l,
  signOutFn: t,
  currentPath: a,
  children: i,
  sidenavItems: o,
  documentationUrl: m,
  cardProps: s
}) {
  return /* @__PURE__ */ e(u, { attribute: "class", defaultTheme: "system", enableSystem: !0, disableTransitionOnChange: !0, children: /* @__PURE__ */ e(d, { defaultOpen: !0, children: /* @__PURE__ */ n("div", { className: "flex h-screen w-full overflow-hidden", children: [
    /* @__PURE__ */ e(f, { userInfo: r, appInfo: l, signOutFn: t, currentPath: a, sidenavItems: o, documentationUrl: m, cardProps: s }),
    /* @__PURE__ */ e("main", { className: "flex-1 overflow-y-auto ml-0 lg:ml-[290px]", children: /* @__PURE__ */ e("div", { className: "mx-[16px]", children: i }) })
  ] }) }) });
}
export {
  v as default
};
