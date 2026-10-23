import { jsxs as n, Fragment as W, jsx as e } from "react/jsx-runtime";
import { useState as X, Fragment as q } from "react";
import { Sidebar as H, SidebarContent as J, SidebarGroup as $, SidebarGroupLabel as K, SidebarGroupContent as M, SidebarMenuItem as p, SidebarMenuButton as N, SidebarMenuSub as Q, SidebarFooter as R, SidebarMenu as V } from "../ui/sidebar.es.js";
import Y from "./SidenavFooterMenu.es.js";
import { genAvatarBackground as y } from "../../_util/helpers.es.js";
import { Avatar as Z, AvatarImage as I } from "../ui/avatar.es.js";
import { AvatarFallback as ee } from "@radix-ui/react-avatar";
import re from "../AvatarBubble/AvatarBubble.es.js";
import { useLinkComponent as ae } from "../../providers/NextLinkProvider.es.js";
import { Collapsible as ne, CollapsibleTrigger as le, CollapsibleContent as te } from "../ui/collapsible.es.js";
import { Menu as ie, X as se, ChevronUp as oe } from "lucide-react";
import { Button as z } from "../ui/button.es.js";
import { cn as ce } from "../../lib/utils.es.js";
import de from "./useActivePaths.es.js";
import he from "./SidenavLogo.es.js";
import me from "../AnnouncementCard/AnnouncementCard.es.js";
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
function Fe({ userInfo: o, appInfo: c, currentPath: t, sidenavItems: r, signOutFn: x, documentationUrl: u, cardProps: B, disableAccountLink: O, ...U }) {
  const f = ae(), { name: j, image: A, email: s } = o, L = !!A, b = j?.split(" ") ?? [], d = b[0] ?? void 0, h = b.length > 1 ? b.slice(1).join(" ") : " ", g = !!(d && h), S = g ? y(d.charAt(0), h.charAt(0)) : y(s.charAt(0), s.charAt(1)), G = g ? d.charAt(0).toUpperCase() + h.charAt(0).toUpperCase() : s.charAt(0).toUpperCase(), P = L ? /* @__PURE__ */ n(Z, { children: [
    /* @__PURE__ */ e(I, { src: A, alt: "user_avatar" }),
    /* @__PURE__ */ e(ee, { children: "Avatar" })
  ] }) : /* @__PURE__ */ e(re, { bgColor: S.bgColor, textColor: S.textColor, children: G }), T = g ? /* @__PURE__ */ e("span", { className: "user-name", children: `${d} ${h}` }) : /* @__PURE__ */ e("span", { className: "user-name", children: s }), i = de(r, t), [m, v] = X(!1), _ = {
    ...c,
    signOutFn: x,
    avatar: P,
    userDisplayName: T,
    email: s,
    documentationUrl: u,
    disableAccountLink: O
  };
  return /* @__PURE__ */ n(W, { children: [
    !m && /* @__PURE__ */ e("div", { className: "lg:hidden fixed top-2 left-4 z-40", children: /* @__PURE__ */ e(z, { variant: "ghost", size: "icon", onClick: () => v(!0), "aria-label": "Open sidebar", children: /* @__PURE__ */ e(ie, { className: "h-5 w-5" }) }) }),
    /* @__PURE__ */ n(
      H,
      {
        variant: "sidebar",
        collapsible: "none",
        ...U,
        className: ce(
          "fixed top-0 left-0 z-40 h-screen bg-background transition-transform duration-300",
          "min-w-[290px] overflow-hidden",
          "flex flex-col",
          m ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        ),
        children: [
          m && /* @__PURE__ */ e("div", { className: "lg:hidden absolute top-4 right-0", children: /* @__PURE__ */ e(z, { variant: "ghost", size: "icon", onClick: () => v(!1), "aria-label": "Close sidebar", children: /* @__PURE__ */ e(se, { className: "h-5 w-5" }) }) }),
          /* @__PURE__ */ e("div", { className: "flex-shrink-0", children: /* @__PURE__ */ e(he, {}) }),
          /* @__PURE__ */ e(J, { className: "flex-1 overflow-y-auto min-h-0", children: r.map((C) => /* @__PURE__ */ n($, { children: [
            /* @__PURE__ */ e(K, { children: C.section }),
            /* @__PURE__ */ e(M, { className: "list-none", children: C.sectionItems.map((a) => {
              const D = a.target === "blank", k = a?.onClick, w = Array.from(i).some((l) => l.startsWith(a.url)), E = ["Projects", "Organizations"].includes(a.title);
              return /* @__PURE__ */ e(q, { children: /* @__PURE__ */ n(ne, { open: w, children: [
                /* @__PURE__ */ e(p, { children: /* @__PURE__ */ e(le, { asChild: !0, children: /* @__PURE__ */ e(
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
                        target: D ? "_blank" : "_self",
                        className: "flex w-full gap-2",
                        children: [
                          /* @__PURE__ */ n("div", { className: "flex items-center gap-2", children: [
                            a.icon && /* @__PURE__ */ e(a.icon, {}),
                            /* @__PURE__ */ e("span", { children: a.title })
                          ] }),
                          E ? /* @__PURE__ */ e(
                            oe,
                            {
                              className: `ml-auto h-4 w-4 transition-transform ${w ? "rotate-180" : "rotate-90"}`
                            }
                          ) : null
                        ]
                      }
                    )
                  }
                ) }) }),
                /* @__PURE__ */ e(te, { children: /* @__PURE__ */ e(Q, { children: a.children?.map((l) => /* @__PURE__ */ n(p, { children: [
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
          /* @__PURE__ */ n(R, { className: "flex-shrink-0", children: [
            /* @__PURE__ */ e($, { children: /* @__PURE__ */ e(M, { children: /* @__PURE__ */ e(me, { ...B || {} }) }) }),
            /* @__PURE__ */ e(V, { children: /* @__PURE__ */ e(p, { children: /* @__PURE__ */ e(Y, { ..._ }) }) })
          ] })
        ]
      }
    ),
    m && /* @__PURE__ */ e("div", { className: "fixed inset-0 bg-black/40 z-30 lg:hidden", onClick: () => v(!1) })
  ] });
}
export {
  Fe as default
};
