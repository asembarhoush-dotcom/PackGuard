import { jsx as e } from "react/jsx-runtime";
import { useTheme as t } from "next-themes";
import { Toaster as s } from "sonner";
const n = ({ ...r }) => {
  const { theme: o = "system" } = t();
  return /* @__PURE__ */ e(
    s,
    {
      theme: o,
      className: "toaster group",
      style: {
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)"
      },
      ...r
    }
  );
};
export {
  n as Toaster
};
