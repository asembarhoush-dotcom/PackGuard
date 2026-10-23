import { jsx as e, Fragment as i } from "react/jsx-runtime";
import { useTheme as s } from "next-themes";
import { useSyncTheme as a } from "../../hooks/useSyncTheme.es.js";
import { Sun as d, Moon as l } from "lucide-react";
function g() {
  const { setTheme: n, theme: t, systemTheme: m } = s();
  a();
  const r = (c) => {
    n(c), window.dispatchEvent(new Event("storage"));
  }, o = /* @__PURE__ */ e("button", { onClick: () => r("light"), children: /* @__PURE__ */ e(d, { className: "mr-2 h-5 w-5" }) }), h = /* @__PURE__ */ e("button", { onClick: () => r("dark"), children: /* @__PURE__ */ e(l, { className: "mr-2 h-5 w-5" }) });
  return /* @__PURE__ */ e(i, { children: t === "dark" || t === "system" && m === "dark" ? o : h });
}
export {
  g as default
};
