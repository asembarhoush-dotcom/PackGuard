import { jsx as e, jsxs as f } from "react/jsx-runtime";
import { SidebarProvider as u } from "../ui/sidebar.es.js";
import c from "../Sidenav/Sidenav.es.js";
import h from "../../providers/ThemeProvider.es.js";
function y({
  userInfo: r,
  appInfo: l,
  signOutFn: t,
  currentPath: a,
  children: i,
  sidenavItems: o,
  documentationUrl: m,
  cardProps: s,
  disableAccountLink: n,
  disableChangeFeedLink: d
}) {
  return /* @__PURE__ */ e(h, { attribute: "class", defaultTheme: "system", enableSystem: !0, disableTransitionOnChange: !0, children: /* @__PURE__ */ e(u, { defaultOpen: !0, children: /* @__PURE__ */ f("div", { className: "flex h-screen w-full overflow-hidden", children: [
    /* @__PURE__ */ e(c, { userInfo: r, appInfo: l, signOutFn: t, currentPath: a, sidenavItems: o, documentationUrl: m, cardProps: s, disableAccountLink: n, disableChangeFeedLink: d }),
    /* @__PURE__ */ e("main", { className: "flex-1 overflow-y-auto ml-0 lg:ml-[290px]", children: /* @__PURE__ */ e("div", { className: "mx-[16px]", children: i }) })
  ] }) }) });
}
export {
  y as default
};
