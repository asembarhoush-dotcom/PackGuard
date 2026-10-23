import { jsxs as r, jsx as e, Fragment as h } from "react/jsx-runtime";
import { ChevronsUpDown as u, LifeBuoy as f, ScrollText as p, UserRoundCog as g, LogOut as N } from "lucide-react";
import { DropdownMenu as w, DropdownMenuTrigger as x, DropdownMenuContent as C, DropdownMenuItem as n } from "../ui/dropdown-menu.es.js";
import { SidebarMenuButton as M } from "../ui/sidebar.es.js";
import { useLinkComponent as k } from "../../providers/NextLinkProvider.es.js";
function j({ email: a, kcUrl: o, signOutFn: s, avatar: l, userDisplayName: c, documentationUrl: i = "https://docs.lagoon.sh/", disableAccountLink: d = !1, disableChangeFeedLink: m = !1 }) {
  const t = k();
  return /* @__PURE__ */ r(w, { modal: !1, children: [
    /* @__PURE__ */ e("section", { className: "flex items-center gap-1 pl-1", children: /* @__PURE__ */ e(x, { className: "w-full", children: /* @__PURE__ */ r(M, { size: "lg", className: "w-full", children: [
      (() => {
        if (l)
          return /* @__PURE__ */ r(h, { children: [
            l,
            /* @__PURE__ */ r("div", { className: "grid flex-1 text-left text-sm leading-tight", children: [
              /* @__PURE__ */ e("span", { className: "truncate font-medium", children: c }),
              /* @__PURE__ */ e("span", { className: "truncate font-light text-xs", children: a })
            ] })
          ] });
      })(),
      /* @__PURE__ */ e(u, { className: "ml-auto h-4 w-4" })
    ] }) }) }),
    /* @__PURE__ */ r(C, { className: "w-56", align: "start", side: "top", sideOffset: 4, children: [
      /* @__PURE__ */ e(n, { asChild: !0, children: /* @__PURE__ */ r(t, { href: i, target: "_blank", className: "cursor-pointer", children: [
        /* @__PURE__ */ e(f, { className: "mr-2 h-4 w-4" }),
        "Documentation"
      ] }) }),
      !m && /* @__PURE__ */ e(n, { asChild: !0, children: /* @__PURE__ */ r(t, { href: "/changefeed", className: "cursor-pointer", children: [
        /* @__PURE__ */ e(p, { className: "mr-2 h-4 w-4" }),
        "Change Feed"
      ] }) }),
      !d && /* @__PURE__ */ e(n, { asChild: !0, children: /* @__PURE__ */ r(t, { href: `${o}/account`, target: "_blank", className: "cursor-pointer", children: [
        /* @__PURE__ */ e(g, { className: "mr-2 h-4 w-4" }),
        "My Account"
      ] }) }),
      /* @__PURE__ */ e(n, { asChild: !0, onClick: () => s(), children: /* @__PURE__ */ r("div", { onClick: () => s(), className: "flex items-center w-full cursor-pointer", children: [
        /* @__PURE__ */ e(N, { className: "mr-2 h-4 w-4" }),
        "Sign Out"
      ] }) })
    ] })
  ] });
}
export {
  j as default
};
