import { jsx as n } from "react/jsx-runtime";
import { createContext as r, useContext as i } from "react";
const t = r(void 0), m = ({ linkComponent: o, children: e }) => /* @__PURE__ */ n(t.Provider, { value: o, children: e }), c = () => {
  const o = i(t);
  if (!o)
    throw new Error("useLinkComponent must be used within a LinkProvider");
  return o;
};
export {
  t as LinkContext,
  m as LinkProvider,
  c as useLinkComponent
};
