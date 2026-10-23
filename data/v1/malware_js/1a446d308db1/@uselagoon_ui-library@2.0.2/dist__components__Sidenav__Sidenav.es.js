import { jsxs as n, Fragment as E, jsx as e } from "react/jsx-runtime";
import { useState as W, Fragment as X } from "react";
import { Sidebar as q, SidebarContent as H, SidebarGroup as $, SidebarGroupLabel as J, SidebarGroupContent as M, SidebarMenuItem as p, SidebarMenuButton as N, SidebarMenuSub as K, SidebarFooter as Q, SidebarMenu as R } from "../ui/sidebar.es.js";
import V from "./SidenavFooterMenu.es.js";
import { genAvatarBackground as y } from "../../_util/helpers.es.js";
import { Avatar as Y, AvatarImage as Z } from "../ui/avatar.es.js";
import { AvatarFallback as I } from "@radix-ui/react-avatar";
import ee from "../AvatarBubble/AvatarBubble.es.js";
import { useLinkComponent as re } from "../../providers/NextLinkProvider.es.js";
import { Collapsible as ae, CollapsibleTrigger as ne, CollapsibleContent as le } from "../ui/collapsible.es.js";
import { Menu as te, X as ie, ChevronUp as se } from "lucide-react";
import { Button as z } from "../ui/button.es.js";
import { cn as oe } from "../../lib/utils.es.js";
import ce from "./useActivePaths.es.js";
import de from "./SidenavLogo.es.js";
import he from "../AnnouncementCard/AnnouncementCard.es.js";
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
function ze({ userInfo: o, appInfo: c, currentPath: t, sidenavItems: r, signOutFn: x, documentationUrl: u, cardProps: B, ...O }) {
  const f = re(), { name: U, image: A, email: s } = o, j = !!A, b = U?.split(" ") ?? [], d = b[0] ?? void 0, h = b.length > 1 ? b.slice(1).join(" ") : " ", g = !!(d && h), S = g ? y(d.charAt(0), h.charAt(0)) : y(s.charAt(0), s.charAt(1)), L = g ? d.charAt(0).toUpperCase() + h.charAt(0).toUpperCase() : s.charAt(0).toUpperCase(), G = j ? /* @__PURE__ */ n(Y, { children: [
    /* @__PURE__ */ e(Z, { src: A, alt: "user_avatar" }),
    /* @__PURE__ */ e(I, { children: "Avatar" })
  ] }) : /* @__PURE__ */ e(ee, { bgColor: S.bgColor, textColor: S.textColor, children: L }), P = g ? /* @__PURE__ */ e("span", { className: "user-name", children: `${d} ${h}` }) : /* @__PURE__ */ e("span", { className: "user-name", children: s }), i = ce(r, t), [m, v] = W(!1), T = {
    ...c,
    signOutFn: x,
    avatar: G,
    userDisplayName: P,
    email: s,
    documentationUrl: u
  };
  return /* @__PURE__ */ n(E, { children: [
    !m && /* @__PURE__ */ e("div", { className: "lg:hidden fixed top-2 left-4 z-40", children: /* @__PURE__ */ e(z, { variant: "ghost", size: "icon", onClick: () => v(!0), "aria-label": "Open sidebar", children: /* @__PURE__ */ e(te, { className: "h-5 w-5" }) }) }),
    /* @__PURE__ */ n(
      q,
      {
        variant: "sidebar",
        collapsible: "none",
        ...O,
        className: oe(
          "fixed top-0 left-0 z-40 h-screen bg-background transition-transform duration-300",
          "min-w-[290px] overflow-hidden",
          "flex flex-col",
          m ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        ),
        children: [
          m && /* @__PURE__ */ e("div", { className: "lg:hidden absolute top-4 right-0", children: /* @__PURE__ */ e(z, { variant: "ghost", size: "icon", onClick: () => v(!1), "aria-label": "Close sidebar", children: /* @__PURE__ */ e(ie, { className: "h-5 w-5" }) }) }),
          /* @__PURE__ */ e("div", { className: "flex-shrink-0", children: /* @__PURE__ */ e(de, {}) }),
          /* @__PURE__ */ e(H, { className: "flex-1 overflow-y-auto min-h-0", children: r.map((C) => /* @__PURE__ */ n($, { children: [
            /* @__PURE__ */ e(J, { children: C.section }),
            /* @__PURE__ */ e(M, { className: "list-none", children: C.sectionItems.map((a) => {
              const _ = a.target === "blank", k = a?.onClick, w = Array.from(i).some((l) => l.startsWith(a.url)), D = ["Projects", "Organizations"].includes(a.title);
              return /* @__PURE__ */ e(X, { children: /* @__PURE__ */ n(ae, { open: w, children: [
                /* @__PURE__ */ e(p, { children: /* @__PURE__ */ e(ne, { asChild: !0, children: /* @__PURE__ */ e(
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
                        target: _ ? "_blank" : "_self",
                        className: "flex w-full gap-2",
                        children: [
                          /* @__PURE__ */ n("div", { className: "flex items-center gap-2", children: [
                            a.icon && /* @__PURE__ */ e(a.icon, {}),
                            /* @__PURE__ */ e("span", { children: a.title })
                          ] }),
                          D ? /* @__PURE__ */ e(
                            se,
                            {
                              className: `ml-auto h-4 w-4 transition-transform ${w ? "rotate-180" : "rotate-90"}`
                            }
                          ) : null
                        ]
                      }
                    )
                  }
                ) }) }),
                /* @__PURE__ */ e(le, { children: /* @__PURE__ */ e(K, { children: a.children?.map((l) => /* @__PURE__ */ n(p, { children: [
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
          /* @__PURE__ */ n(Q, { className: "flex-shrink-0", children: [
            /* @__PURE__ */ e($, { children: /* @__PURE__ */ e(M, { children: /* @__PURE__ */ e(he, { ...B || {} }) }) }),
            /* @__PURE__ */ e(R, { children: /* @__PURE__ */ e(p, { children: /* @__PURE__ */ e(V, { ...T }) }) })
          ] })
        ]
      }
    ),
    m && /* @__PURE__ */ e("div", { className: "fixed inset-0 bg-black/40 z-30 lg:hidden", onClick: () => v(!1) })
  ] });
}
export {
  ze as default
};
