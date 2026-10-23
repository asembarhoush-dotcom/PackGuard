import { jsx as r, Fragment as t } from "react/jsx-runtime";
import { Tabs as l, TabsList as n, TabsTrigger as o } from "../ui/tabs.es.js";
const c = ({ items: i, pathname: a }) => /* @__PURE__ */ r(t, { children: /* @__PURE__ */ r(l, { value: (() => {
  for (const e of i)
    if (a?.endsWith(`/${e.key}`) || a?.includes(`/${e.key}/`))
      return e.key;
  return i[0]?.key || "";
})(), children: /* @__PURE__ */ r(n, { children: i.map((e) => /* @__PURE__ */ r(o, { value: e.key, children: e.label }, e.key)) }) }) });
c.displayName = "TabNavigation";
export {
  c as default
};
