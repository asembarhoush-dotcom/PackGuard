import { jsxs as n, Fragment as X, jsx as e } from "react/jsx-runtime";
import { useState as q, Fragment as H } from "react";
import { Sidebar as J, SidebarContent as K, SidebarGroup as $, SidebarGroupLabel as Q, SidebarGroupContent as M, SidebarMenuItem as p, SidebarMenuButton as N, SidebarMenuSub as R, SidebarFooter as V, SidebarMenu as Y } from "../ui/sidebar.es.js";
import Z from "./SidenavFooterMenu.es.js";
import { genAvatarBackground as y } from "../../_util/helpers.es.js";
import { Avatar as I, AvatarImage as ee } from "../ui/avatar.es.js";
import { AvatarFallback as re } from "@radix-ui/react-avatar";
import ae from "../AvatarBubble/AvatarBubble.es.js";
import { useLinkComponent as ne } from "../../providers/NextLinkProvider.es.js";
import { Collapsible as le, CollapsibleTrigger as te, CollapsibleContent as ie } from "../ui/collapsible.es.js";
import { Menu as se, X as oe, ChevronUp as ce } from "lucide-react";
import { Button as z } from "../ui/button.es.js";
import { cn as de } from "../../lib/utils.es.js";
import he from "./useActivePaths.es.js";
import me from "./SidenavLogo.es.js";
import pe from "../AnnouncementCard/AnnouncementCard.es.js";
const F = (o, c, t) => c.children?.length ? /* @__PURE__ */ e("ul", { className: "ml-4 mt-2 space-y-1", children: c.children.map((r) => {
  const u = r.children && r.children.length > 0 ? t.has(r.url) || t.has(`${r.url}:parent`) : t.has(r.url);
  return /* @__PURE__ */ n(p, { children: [
    /* @__PURE__ */ e(N, { asChild: !0, isActive: u, children: /* @__PURE__ */ e(o, { href: r.url, className: `${r.icon ? "" : "ml-4"}`, children: /* @__PURE__ */ n("div", { className: "flex items-center gap-2", children: [
      r.icon && /* @__PURE__ */ e(r.icon, {}),
      /* @__PURE__ */ e("span", { children: r.title })
    ] }) }) }),
    F(o, r, t)
  ] }, r.title);
}) }) : null;
function Be({ userInfo: o, appInfo: c, currentPath: t, sidenavItems: r, signOutFn: x, documentationUrl: u, cardProps: B, disableAccountLink: O, disableChangeFeedLink: U, ...j }) {
  const f = ne(), { name: L, image: A, email: s } = o, G = !!A, b = L?.split(" ") ?? [], d = b[0] ?? void 0, h = b.length > 1 ? b.slice(1).join(" ") : " ", g = !!(d && h), S = g ? y(d.charAt(0), h.charAt(0)) : y(s.charAt(0), s.charAt(1)), P = g ? d.charAt(0).toUpperCase() + h.charAt(0).toUpperCase() : s.charAt(0).toUpperCase(), T = G ? /* @__PURE__ */ n(I, { children: [
    /* @__PURE__ */ e(ee, { src: A, alt: "user_avatar" }),
    /* @__PURE__ */ e(re, { children: "Avatar" })
  ] }) : /* @__PURE__ */ e(ae, { bgColor: S.bgColor, textColor: S.textColor, children: P }), _ = g ? /* @__PURE__ */ e("span", { className: "user-name", children: `${d} ${h}` }) : /* @__PURE__ */ e("span", { className: "user-name", children: s }), i = he(r, t), [m, v] = q(!1), D = {
    ...c,
    signOutFn: x,
    avatar: T,
    userDisplayName: _,
    email: s,
    documentationUrl: u,
    disableAccountLink: O,
    disableChangeFeedLink: U
  };
  return /* @__PURE__ */ n(X, { children: [
    !m && /* @__PURE__ */ e("div", { className: "lg:hidden fixed top-2 left-4 z-40", children: /* @__PURE__ */ e(z, { variant: "ghost", size: "icon", onClick: () => v(!0), "aria-label": "Open sidebar", children: /* @__PURE__ */ e(se, { className: "h-5 w-5" }) }) }),
    /* @__PURE__ */ n(
      J,
      {
        variant: "sidebar",
        collapsible: "none",
        ...j,
        className: de(
          "fixed top-0 left-0 z-40 h-screen bg-background transition-transform duration-300",
          "min-w-[290px] overflow-hidden",
          "flex flex-col",
          m ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        ),
        children: [
          m && /* @__PURE__ */ e("div", { className: "lg:hidden absolute top-4 right-0", children: /* @__PURE__ */ e(z, { variant: "ghost", size: "icon", onClick: () => v(!1), "aria-label": "Close sidebar", children: /* @__PURE__ */ e(oe, { className: "h-5 w-5" }) }) }),
          /* @__PURE__ */ e("div", { className: "flex-shrink-0", children: /* @__PURE__ */ e(me, {}) }),
          /* @__PURE__ */ e(K, { className: "flex-1 overflow-y-auto min-h-0", children: r.map((C) => /* @__PURE__ */ n($, { children: [
            /* @__PURE__ */ e(Q, { children: C.section }),
            /* @__PURE__ */ e(M, { className: "list-none", children: C.sectionItems.map((a) => {
              const E = a.target === "blank", k = a?.onClick, w = Array.from(i).some((l) => l.startsWith(a.url)), W = ["Projects", "Organizations"].includes(a.title);
              return /* @__PURE__ */ e(H, { children: /* @__PURE__ */ n(le, { open: w, children: [
                /* @__PURE__ */ e(p, { children: /* @__PURE__ */ e(te, { asChild: !0, children: /* @__PURE__ */ e(
                  N,
                  {
                    asChild: !0,
                    isActive: i.has(a.url) || i.has(`${a.url}:parent`),
                    children: /* @__PURE__ */ n(
                      f,
                      {
                        "data-cy": `nav-${a.url.slice(1)}`,
                        onClick: async () => {
                          k && await k();
                        },
                        href: a.url,
                        target: E ? "_blank" : "_self",
                        className: "flex w-full gap-2",
                        children: [
                          /* @__PURE__ */ n("div", { className: "flex items-center gap-2", children: [
                            a.icon && /* @__PURE__ */ e(a.icon, {}),
                            /* @__PURE__ */ e("span", { children: a.title })
                          ] }),
                          W ? /* @__PURE__ */ e(
                            ce,
                            {
                              className: `ml-auto h-4 w-4 transition-transform ${w ? "rotate-180" : "rotate-90"}`
                            }
                          ) : null
                        ]
                      }
                    )
                  }
                ) }) }),
                /* @__PURE__ */ e(ie, { children: /* @__PURE__ */ e(R, { children: a.children?.map((l) => /* @__PURE__ */ n(p, { children: [
                  /* @__PURE__ */ e(
                    N,
                    {
                      asChild: !0,
                      isActive: i.has(l.url) || i.has(`${l.url}:parent`),
                      children: /* @__PURE__ */ e(f, { href: l.url, className: "mt-2", children: /* @__PURE__ */ n("div", { className: "flex items-center gap-2", children: [
                        l.icon && /* @__PURE__ */ e(l.icon, {}),
                        /* @__PURE__ */ e("span", { children: l.title })
                      ] }) })
                    }
                  ),
                  F(f, l, i)
                ] }, l.title)) }) })
              ] }) }, a.title);
            }) })
          ] }, C.section)) }),
          /* @__PURE__ */ n(V, { className: "flex-shrink-0", children: [
            /* @__PURE__ */ e($, { children: /* @__PURE__ */ e(M, { children: /* @__PURE__ */ e(pe, { ...B || {} }) }) }),
            /* @__PURE__ */ e(Y, { children: /* @__PURE__ */ e(p, { children: /* @__PURE__ */ e(Z, { ...D }) }) })
          ] })
        ]
      }
    ),
    m && /* @__PURE__ */ e("div", { className: "fixed inset-0 bg-black/40 z-30 lg:hidden", onClick: () => v(!1) })
  ] });
}
export {
  Be as default
};
