import { z as o } from "zod";
const n = o.object({
  title: o.string().optional(),
  description: o.string().optional(),
  ctaText: o.string().optional(),
  ctaUrl: o.string().optional(),
  openInNewTab: o.boolean().optional(),
  className: o.string().optional(),
  defaultLogo: o.boolean().optional(),
  disabled: o.boolean().optional()
}).strict();
export {
  n as AnnouncementCardPropsSchema
};
