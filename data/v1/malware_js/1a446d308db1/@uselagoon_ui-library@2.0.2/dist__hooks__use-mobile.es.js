import * as o from "react";
const e = 768;
function r() {
  const [s, n] = o.useState(void 0);
  return o.useEffect(() => {
    const t = window.matchMedia(`(max-width: ${e - 1}px)`), i = () => {
      n(window.innerWidth < e);
    };
    return t.addEventListener("change", i), n(window.innerWidth < e), () => t.removeEventListener("change", i);
  }, []), !!s;
}
export {
  r as useIsMobile
};
