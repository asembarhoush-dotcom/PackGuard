import "react/jsx-runtime";
import "react";
import "react-highlight-words";
const p = (t, e) => {
  const o = (a) => a.charCodeAt(0) - 64, r = (a) => Math.round(o(a) * 11);
  let n = r(t) % 256, l = r(e) % 256, c = Math.round((o(t) + o(e)) / 2 * 11) % 256;
  return {
    bgColor: `rgb(${n}, ${l}, ${c})`,
    textColor: s(n, l, c) > 0.5 ? "#000000" : "#FFFFFF"
  };
};
function s(t, e, o) {
  const r = [t, e, o].map((n) => (n /= 255, n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4)));
  return 0.2126 * r[0] + 0.7152 * r[1] + 0.0722 * r[2];
}
const g = (t) => t * 24 * 60 * 60 * 1e3, d = (t, e, o) => {
  const n = {
    value: e,
    expiry: (/* @__PURE__ */ new Date()).getTime() + g(o)
  };
  localStorage.setItem(t, JSON.stringify(n));
}, S = (t) => {
  const e = localStorage.getItem(t);
  if (!e)
    return null;
  const o = JSON.parse(e);
  return o.expiry < Date.now() ? (localStorage.removeItem(t), null) : o.value;
};
export {
  p as genAvatarBackground,
  S as getLocalStorage,
  d as setLocalStorage
};
