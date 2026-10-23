import { jsxs as r, jsx as e, Fragment as m } from "react/jsx-runtime";
import { ChevronsUpDown as h, LifeBuoy as u, ScrollText as f, UserRoundCog as p, LogOut as g } from "lucide-react";
import { DropdownMenu as N, DropdownMenuTrigger as w, DropdownMenuContent as x, DropdownMenuItem as n } from "../ui/dropdown-menu.es.js";
import { SidebarMenuButton as C } from "../ui/sidebar.es.js";
import { useLinkComponent as M } from "../../providers/NextLinkProvider.es.js";
function A({ email: a, kcUrl: o, signOutFn: s, avatar: l, userDisplayName: c, documentationUrl: i = "https://docs.lagoon.sh/", disableAccountLink: d = !1 }) {
  const t = M();
  return /* @__PURE__ */ r(N, { modal: !1, children: [
    /* @__PURE__ */ e("section", { className: "flex items-center gap-1 pl-1", children: /* @__PURE__ */ e(w, { className: "w-full", children: /* @__PURE__ */ r(C, { size: "lg", className: "w-full", children: [
      (() => {
        if (l)
          return /* @__PURE__ */ r(m, { children: [
            l,
            /* @__PURE__ */ r("div", { className: "grid flex-1 text-left text-sm leading-tight", children: [
              /* @__PURE__ */ e("span", { className: "truncate font-medium", children: c }),
              /* @__PURE__ */ e("span", { className: "truncate font-light text-xs", children: a })
            ] })
          ] });
      })(),
      /* @__PURE__ */ e(h, { className: "ml-auto h-4 w-4" })
    ] }) }) }),
    /* @__PURE__ */ r(x, { className: "w-56", align: "start", side: "top", sideOffset: 4, children: [
      /* @__PURE__ */ e(n, { asChild: !0, children: /* @__PURE__ */ r(t, { href: i, target: "_blank", className: "cursor-pointer", children: [
        /* @__PURE__ */ e(u, { className: "mr-2 h-4 w-4" }),
        "Documentation"
      ] }) }),
      /* @__PURE__ */ e(n, { asChild: !0, children: /* @__PURE__ */ r(t, { href: "/changefeed", className: "cursor-pointer", children: [
        /* @__PURE__ */ e(f, { className: "mr-2 h-4 w-4" }),
        "Change Feed"
      ] }) }),
      !d && /* @__PURE__ */ e(n, { asChild: !0, children: /* @__PURE__ */ r(t, { href: `${o}/account`, target: "_blank", className: "cursor-pointer", children: [
        /* @__PURE__ */ e(p, { className: "mr-2 h-4 w-4" }),
        "My Account"
      ] }) }),
      /* @__PURE__ */ e(n, { asChild: !0, onClick: () => s(), children: /* @__PURE__ */ r("div", { onClick: () => s(), className: "flex items-center w-full cursor-pointer", children: [
        /* @__PURE__ */ e(g, { className: "mr-2 h-4 w-4" }),
        "Sign Out"
      ] }) })
    ] })
  ] });
}
export {
  A as default
};
