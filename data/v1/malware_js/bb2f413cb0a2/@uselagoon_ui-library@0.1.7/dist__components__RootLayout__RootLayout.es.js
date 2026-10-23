import { jsx as e, jsxs as d } from "react/jsx-runtime";
import { SidebarProvider as f } from "../ui/sidebar.es.js";
import u from "../Sidenav/Sidenav.es.js";
import c from "../../providers/ThemeProvider.es.js";
function b({
  userInfo: r,
  appInfo: l,
  signOutFn: t,
  currentPath: a,
  children: i,
  sidenavItems: o,
  documentationUrl: m,
  cardProps: s,
  disableAccountLink: n
}) {
  return /* @__PURE__ */ e(c, { attribute: "class", defaultTheme: "system", enableSystem: !0, disableTransitionOnChange: !0, children: /* @__PURE__ */ e(f, { defaultOpen: !0, children: /* @__PURE__ */ d("div", { className: "flex h-screen w-full overflow-hidden", children: [
    /* @__PURE__ */ e(u, { userInfo: r, appInfo: l, signOutFn: t, currentPath: a, sidenavItems: o, documentationUrl: m, cardProps: s, disableAccountLink: n }),
    /* @__PURE__ */ e("main", { className: "flex-1 overflow-y-auto ml-0 lg:ml-[290px]", children: /* @__PURE__ */ e("div", { className: "mx-[16px]", children: i }) })
  ] }) }) });
}
export {
  b as default
};
