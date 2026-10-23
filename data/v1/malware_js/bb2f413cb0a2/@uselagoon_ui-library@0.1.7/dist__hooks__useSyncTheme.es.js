import { useEffect as t } from "react";
import { useTheme as o } from "next-themes";
function c() {
  const { resolvedTheme: e } = o();
  t(() => {
    e && localStorage.getItem("theme") !== e && localStorage.setItem("theme", e);
  }, [e]);
}
export {
  c as useSyncTheme
};
