import { z as o } from "zod";
const n = o.object({
  email: o.email().optional(),
  documentationUrl: o.url().optional(),
  disableAccountLink: o.boolean().optional(),
  disableChangeFeedLink: o.boolean().optional()
}).strict();
export {
  n as SidenavFooterMenuSchema
};
