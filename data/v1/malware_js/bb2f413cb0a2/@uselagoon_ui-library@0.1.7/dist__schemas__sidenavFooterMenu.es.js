import { z as o } from "zod";
const e = o.object({
  email: o.email().optional(),
  documentationUrl: o.url().optional(),
  disableAccountLink: o.boolean().optional()
}).strict();
export {
  e as SidenavFooterMenuSchema
};
