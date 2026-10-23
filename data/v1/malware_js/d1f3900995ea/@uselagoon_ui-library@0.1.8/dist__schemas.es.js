import { z as t } from "zod";
import { AnnouncementCardPropsSchema as l } from "./schemas/announcementCard.es.js";
import { SidenavFooterMenuSchema as p } from "./schemas/sidenavFooterMenu.es.js";
import { ChangeFeedContainerSchema as u } from "./schemas/changeFeed.es.js";
const b = t.url().optional(), d = {
  documentationUrl: b
}, f = {
  announcementCard: l,
  sidenavFooterMenu: p,
  changeFeed: u
}, j = t.object({
  global: t.object({
    documentationUrl: b.optional()
  }).strict().optional(),
  components: t.object({
    announcementCard: l.optional(),
    sidenavFooterMenu: p.optional(),
    changeFeed: u.optional()
  }).strict().optional()
}).strict();
function k(c) {
  const a = { global: {}, components: {} }, n = [];
  if (typeof c != "object" || c === null)
    return n.push({ key: "Override", message: "Data must be an object" }), { valid: a, errors: n };
  const e = c;
  if (e.global !== void 0 && e.global !== null && typeof e.global == "object")
    for (const [o, i] of Object.entries(e.global)) {
      const s = d[o];
      if (!s) {
        n.push({ key: `Global.${o}`, message: "Unknown global key not compatible with overrides" });
        continue;
      }
      try {
        a.global[o] = s.parse(i);
      } catch (r) {
        r instanceof t.ZodError && r.issues.forEach((m) => {
          n.push({ key: `Global.${o}`, message: m.message });
        });
      }
    }
  if (e.components !== void 0 && e.components !== null && typeof e.components == "object") {
    a.components = {};
    for (const [o, i] of Object.entries(e.components)) {
      const s = f[o];
      if (!s) {
        n.push({ key: `Components.${o}`, message: "Unknown component not compatible with overrides" });
        continue;
      }
      try {
        a.components[o] = s.parse(i);
      } catch (r) {
        r instanceof t.ZodError && r.issues.forEach((m) => {
          n.push({ key: `Components.${o}`, message: m.message });
        });
      }
    }
  }
  return { valid: a, errors: n };
}
export {
  j as OverridesSchema,
  k as validateOverrides
};
