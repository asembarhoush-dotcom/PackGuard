import { jsx as o, jsxs as s, Fragment as J } from "react/jsx-runtime";
import c, { useRef as K, useEffect as y, useMemo as Q } from "react";
import { Button as p } from "../ui/button.es.js";
import { useReactTable as U, getSortedRowModel as X, getFilteredRowModel as Y, getPaginationRowModel as Z, getCoreRowModel as ee, flexRender as k } from "@tanstack/react-table";
import { Table as te, TableHeader as ne, TableRow as S, TableHead as oe, TableBody as le, TableCell as F } from "../ui/table.es.js";
import { DebouncedInput as ie } from "../Input/Input.es.js";
import { highlightTextInElement as se } from "./HighlightText.es.js";
import { cn as I } from "../../lib/utils.es.js";
import { Skeleton as re } from "../ui/skeleton.es.js";
import ae from "../Select/Select.es.js";
function xe({
  columns: u,
  data: m,
  searchableColumns: d,
  searchPlaceholder: T,
  onSearch: N,
  loading: r,
  renderFilters: P,
  disableExtra: h,
  disablePagination: g,
  initialSearch: R,
  initialPageSize: w,
  onRowClick: M
}) {
  const [C, V] = c.useState([]), [D, z] = c.useState([]), [H, W] = c.useState({}), [f, j] = c.useState(R ?? ""), x = K(null);
  y(() => {
    R && x.current && x.current.focus();
  }, []);
  const L = (e, t, l) => d?.length === 0 ? String(e.getValue(t)).toLowerCase().includes(l.toLowerCase()) : d?.some((i) => {
    const a = e.getValue(i);
    return String(a).toLowerCase().includes(l.toLowerCase());
  }), G = (e) => {
    const t = e.getValue(), l = k(e.column.columnDef.cell, e.getContext());
    return t && f && (!d?.length || d?.includes(e.column.id)) && typeof e.column.columnDef.cell == "function" ? se(
      e?.column?.columnDef?.cell(e.getContext()),
      f,
      t
    ) : l;
  }, b = c.useMemo(() => r ? Array(10).fill({}) : m, [r, m]), _ = c.useMemo(
    () => r ? u.map((e) => ({
      ...e,
      cell: () => /* @__PURE__ */ o(re, { className: "h-6 w-50 rounded-sm" })
    })) : u,
    [r, u]
  ), n = U({
    data: b,
    columns: _,
    getCoreRowModel: ee(),
    getPaginationRowModel: Z(),
    getFilteredRowModel: Y(),
    getSortedRowModel: X(),
    onColumnFiltersChange: z,
    onSortingChange: V,
    onColumnVisibilityChange: W,
    autoResetPageIndex: !1,
    ...d ? { globalFilterFn: L } : {},
    state: {
      sorting: C,
      columnFilters: D,
      columnVisibility: H,
      globalFilter: f
    }
  }), v = C.length > 0 ? C[0].id : null;
  y(() => {
    (h || g) && n.setPageSize(m.length);
  }, [h, g, m.length]), y(() => {
    w && !g && n.setPageSize(w);
  }, [w, g]);
  const A = Q(
    () => Math.min(1e3, Math.max(40, Math.floor(b.length * 0.0725))),
    [b.length]
  ), B = n.getPageCount(), O = n.getState().pagination.pageIndex + 1, E = Array.from({ length: B || 1 }, (e, t) => t + 1).map((e) => ({ label: `Page ${String(e)}`, value: e })), $ = (e) => {
    n.setPageIndex(Number(e) - 1);
  }, q = (e, t) => {
    if (typeof M != "function") return;
    const l = e.target, i = l.closest('[data-slot="table-cell"]');
    e.currentTarget.contains(l) && (i?.firstElementChild?.contains(l) || M(t));
  };
  return /* @__PURE__ */ s("div", { className: "w-[100%] mx-auto", children: [
    h ? null : /* @__PURE__ */ s("div", { className: "flex items-end justify-between py-4", children: [
      /* @__PURE__ */ o(
        ie,
        {
          ref: x,
          debounce: A,
          label: "",
          placeholder: T ?? "Start typing to search",
          value: f ?? "",
          onChange: (e) => {
            N && N(e), !r && j(e);
          },
          className: "max-w-sm"
        }
      ),
      P && P(n)
    ] }),
    /* @__PURE__ */ o("div", { className: "rounded-md border", children: /* @__PURE__ */ s(te, { className: "table-fixed", children: [
      /* @__PURE__ */ o(ne, { children: n.getHeaderGroups().map((e) => /* @__PURE__ */ o(S, { className: "py-6", children: e.headers.map((t) => {
        const l = t.column.id === v, i = t.column.getSize(), a = t.column.columnDef?.width || i;
        return /* @__PURE__ */ o(
          oe,
          {
            className: I("transition-colors py-1", l && "bg-gray-100 dark:bg-gray-700"),
            style: { width: a },
            children: /* @__PURE__ */ o("div", { className: "line-clamp-2 break-all leading-snug", children: t.isPlaceholder ? null : k(t.column.columnDef.header, t.getContext()) })
          },
          t.id
        );
      }) }, e.id)) }),
      /* @__PURE__ */ o(le, { children: n.getRowModel().rows?.length ? n.getRowModel().rows.map((e) => /* @__PURE__ */ o(
        S,
        {
          onClick: (t) => q(t, e),
          className: "py-6",
          "data-state": e.getIsSelected() && "selected",
          children: e.getVisibleCells().map((t) => {
            const l = t.column.id === v, i = t.column.getSize(), a = t.column.columnDef?.width || i;
            return /* @__PURE__ */ o(
              F,
              {
                style: { width: a },
                className: I(
                  "transition-colors py-6 text-ellipsis",
                  l && "bg-gray-100 dark:bg-gray-700"
                ),
                children: /* @__PURE__ */ o("div", { className: "line-clamp-3 break-words leading-snug", children: G(t) })
              },
              t.id
            );
          })
        },
        e.id
      )) : /* @__PURE__ */ o(S, { children: /* @__PURE__ */ o(F, { colSpan: u.length, className: "h-48 text-center", children: "No entries" }) }) })
    ] }) }),
    h ? null : /* @__PURE__ */ s("div", { className: "flex items-center justify-end space-x-2 py-6", children: [
      /* @__PURE__ */ s("div", { className: "text-muted-foreground flex-1 text-sm", children: [
        "Showing ",
        n.getRowModel().rows.length,
        " of ",
        n.getPrePaginationRowModel().rows.length,
        " entries"
      ] }),
      !g && /* @__PURE__ */ s(J, { children: [
        /* @__PURE__ */ s("div", { className: "flex w-[100px] items-center justify-center text-sm font-medium", children: [
          "Page ",
          n.getState().pagination.pageIndex + 1,
          " of ",
          n.getPageCount() || 1
        ] }),
        /* @__PURE__ */ o(p, { variant: "outline", size: "sm", onClick: () => n.firstPage(), disabled: !n.getCanPreviousPage(), children: "<<" }),
        /* @__PURE__ */ o(
          p,
          {
            variant: "outline",
            size: "sm",
            onClick: () => n.previousPage(),
            disabled: !n.getCanPreviousPage(),
            children: "Previous"
          }
        ),
        /* @__PURE__ */ o(p, { variant: "outline", size: "sm", onClick: () => n.nextPage(), disabled: !n.getCanNextPage(), children: "Next" }),
        /* @__PURE__ */ o(p, { variant: "outline", size: "sm", onClick: () => n.lastPage(), disabled: !n.getCanNextPage(), children: ">>" }),
        /* @__PURE__ */ o(
          ae,
          {
            value: String(O) || void 0,
            placeholder: "Go to page",
            options: E,
            onValueChange: $,
            disabled: r
          }
        )
      ] })
    ] })
  ] });
}
export {
  xe as default
};
