import { jsx as a } from "react/jsx-runtime";
import { cn as o } from "../../lib/utils.es.js";
function n({ className: t, ...e }) {
  return /* @__PURE__ */ a("div", { "data-slot": "table-container", className: "relative w-full overflow-x-auto", children: /* @__PURE__ */ a("table", { "data-slot": "table", className: o("w-full caption-bottom text-sm", t), ...e }) });
}
function s({ className: t, ...e }) {
  return /* @__PURE__ */ a("thead", { "data-slot": "table-header", className: o("[&_tr]:border-b", t), ...e });
}
function d({ className: t, ...e }) {
  return /* @__PURE__ */ a("tbody", { "data-slot": "table-body", className: o("[&_tr:last-child]:border-0", t), ...e });
}
function b({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    "tfoot",
    {
      "data-slot": "table-footer",
      className: o("bg-muted/50 border-t font-medium [&>tr]:last:border-b-0", t),
      ...e
    }
  );
}
function c({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    "tr",
    {
      "data-slot": "table-row",
      className: o("hover:bg-muted/50 data-[state=selected]:bg-muted border-b transition-colors", t),
      ...e
    }
  );
}
function i({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    "th",
    {
      "data-slot": "table-head",
      className: o(
        "text-foreground h-14 px-2 text-left align-middle font-medium whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        t
      ),
      ...e
    }
  );
}
function m({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    "td",
    {
      "data-slot": "table-cell",
      className: o("p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]", t),
      ...e
    }
  );
}
function u({ className: t, ...e }) {
  return /* @__PURE__ */ a("caption", { "data-slot": "table-caption", className: o("text-muted-foreground mt-4 text-sm", t), ...e });
}
export {
  n as Table,
  d as TableBody,
  u as TableCaption,
  m as TableCell,
  b as TableFooter,
  i as TableHead,
  s as TableHeader,
  c as TableRow
};
