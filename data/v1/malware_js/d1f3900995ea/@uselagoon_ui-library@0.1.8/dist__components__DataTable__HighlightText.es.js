import { jsx as g } from "react/jsx-runtime";
import s from "react-highlight-words";
import r from "react";
const a = (i, t, h) => typeof i == "string" ? /* @__PURE__ */ g(s, { highlightClassName: "highlighted", searchWords: [t], autoEscape: !0, textToHighlight: i }) : r.isValidElement(i) ? r.cloneElement(
  i,
  { ...i.props, key: `item-${h}` },
  r.Children.map(
    i.props.children,
    (o, p) => a(o, t, `${p}-${h}`)
  )
) : i;
export {
  a as highlightTextInElement
};
