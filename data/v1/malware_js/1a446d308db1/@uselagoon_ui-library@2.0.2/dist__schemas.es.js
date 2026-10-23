import { z as t } from "zod";
import { AnnouncementCardPropsSchema as m } from "./schemas/announcementCard.es.js";
const p = t.url().optional(), u = {
  documentationUrl: p
}, b = {
  announcementCard: m
}, d = t.object({
  global: t.object({
    documentationUrl: p.optional()
  }).strict().optional(),
  components: t.object({
    announcementCard: m.optional()
  }).strict().optional()
}).strict();
function g(r) {
  const s = { global: {}, components: {} }, n = [];
  if (typeof r != "object" || r === null)
    return n.push({ key: "Override", message: "Data must be an object" }), { valid: s, errors: n };
  const e = r;
  if (e.global !== void 0 && e.global !== null && typeof e.global == "object")
    for (const [o, i] of Object.entries(e.global)) {
      const a = u[o];
      if (!a) {
        n.push({ key: `Global.${o}`, message: "Unknown global key not compatible with overrides" });
        continue;
      }
      try {
        s.global[o] = a.parse(i);
      } catch (c) {
        c instanceof t.ZodError && c.issues.forEach((l) => {
          n.push({ key: `Global.${o}`, message: l.message });
        });
      }
    }
  if (e.components !== void 0 && e.components !== null && typeof e.components == "object") {
    s.components = {};
    for (const [o, i] of Object.entries(e.components)) {
      const a = b[o];
      if (!a) {
        n.push({ key: `Components.${o}`, message: "Unknown component not compatible with overrides" });
        continue;
      }
      try {
        s.components[o] = a.parse(i);
      } catch (c) {
        c instanceof t.ZodError && c.issues.forEach((l) => {
          n.push({ key: `Components.${o}`, message: l.message });
        });
      }
    }
  }
  return { valid: s, errors: n };
}
export {
  d as OverridesSchema,
  g as validateOverrides
};
