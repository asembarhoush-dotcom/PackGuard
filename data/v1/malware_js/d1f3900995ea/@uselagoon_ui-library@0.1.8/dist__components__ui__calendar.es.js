import { jsx as n } from "react/jsx-runtime";
import * as g from "react";
import { ChevronLeftIcon as b, ChevronRightIcon as w, ChevronDownIcon as _ } from "lucide-react";
import { getDefaultClassNames as f, DayPicker as h } from "react-day-picker";
import { cn as e } from "../../lib/utils.es.js";
import { buttonVariants as m, Button as y } from "./button.es.js";
function j({
  className: c,
  classNames: i,
  showOutsideDays: r = !0,
  captionLayout: l = "label",
  buttonVariant: s = "ghost",
  formatters: u,
  components: p,
  ...x
}) {
  const t = f();
  return /* @__PURE__ */ n(
    h,
    {
      showOutsideDays: r,
      className: e(
        "bg-background group/calendar p-3 [--cell-size:--spacing(8)] [[data-slot=card-content]_&]:bg-transparent [[data-slot=popover-content]_&]:bg-transparent",
        String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,
        String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,
        c
      ),
      captionLayout: l,
      formatters: {
        formatMonthDropdown: (a) => a.toLocaleString("default", { month: "short" }),
        ...u
      },
      classNames: {
        root: e("w-fit", t.root),
        months: e("flex gap-4 flex-col md:flex-row relative", t.months),
        month: e("flex flex-col w-full gap-4", t.month),
        nav: e("flex items-center gap-1 w-full absolute top-0 inset-x-0 justify-between", t.nav),
        button_previous: e(
          m({ variant: s }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          t.button_previous
        ),
        button_next: e(
          m({ variant: s }),
          "size-(--cell-size) aria-disabled:opacity-50 p-0 select-none",
          t.button_next
        ),
        month_caption: e(
          "flex items-center justify-center h-(--cell-size) w-full px-(--cell-size)",
          t.month_caption
        ),
        dropdowns: e(
          "w-full flex items-center text-sm font-medium justify-center h-(--cell-size) gap-1.5",
          t.dropdowns
        ),
        dropdown_root: e(
          "relative has-focus:border-ring border border-input shadow-xs has-focus:ring-ring/50 has-focus:ring-[3px] rounded-md",
          t.dropdown_root
        ),
        dropdown: e("absolute inset-0 opacity-0", t.dropdown),
        caption_label: e(
          "select-none font-medium",
          l === "label" ? "text-sm" : "rounded-md pl-2 pr-1 flex items-center gap-1 text-sm h-8 [&>svg]:text-muted-foreground [&>svg]:size-3.5",
          t.caption_label
        ),
        table: "w-full border-collapse",
        weekdays: e("flex", t.weekdays),
        weekday: e(
          "text-muted-foreground rounded-md flex-1 font-normal text-[0.8rem] select-none",
          t.weekday
        ),
        week: e("flex w-full mt-2", t.week),
        week_number_header: e("select-none w-(--cell-size)", t.week_number_header),
        week_number: e("text-[0.8rem] select-none text-muted-foreground", t.week_number),
        day: e(
          "relative w-full h-full p-0 text-center [&:first-child[data-selected=true]_button]:rounded-l-md [&:last-child[data-selected=true]_button]:rounded-r-md group/day aspect-square select-none",
          t.day
        ),
        range_start: e("rounded-l-md bg-accent", t.range_start),
        range_middle: e("rounded-none", t.range_middle),
        range_end: e("rounded-r-md bg-accent", t.range_end),
        today: e(
          "bg-accent text-accent-foreground rounded-md data-[selected=true]:rounded-none",
          t.today
        ),
        outside: e("text-muted-foreground aria-selected:text-muted-foreground", t.outside),
        disabled: e("text-muted-foreground opacity-50", t.disabled),
        hidden: e("invisible", t.hidden),
        ...i
      },
      components: {
        Root: ({ className: a, rootRef: d, ...o }) => /* @__PURE__ */ n("div", { "data-slot": "calendar", ref: d, className: e(a), ...o }),
        Chevron: ({ className: a, orientation: d, ...o }) => d === "left" ? /* @__PURE__ */ n(b, { className: e("size-4", a), ...o }) : d === "right" ? /* @__PURE__ */ n(w, { className: e("size-4", a), ...o }) : /* @__PURE__ */ n(_, { className: e("size-4", a), ...o }),
        DayButton: v,
        WeekNumber: ({ children: a, ...d }) => /* @__PURE__ */ n("td", { ...d, children: /* @__PURE__ */ n("div", { className: "flex size-(--cell-size) items-center justify-center text-center", children: a }) }),
        ...p
      },
      ...x
    }
  );
}
function v({ className: c, day: i, modifiers: r, ...l }) {
  const s = f(), u = g.useRef(null);
  return g.useEffect(() => {
    r.focused && u.current?.focus();
  }, [r.focused]), /* @__PURE__ */ n(
    y,
    {
      ref: u,
      variant: "ghost",
      size: "icon",
      "data-day": i.date.toLocaleDateString(),
      "data-selected-single": r.selected && !r.range_start && !r.range_end && !r.range_middle,
      "data-range-start": r.range_start,
      "data-range-end": r.range_end,
      "data-range-middle": r.range_middle,
      className: e(
        "data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[range-start=true]:text-primary-foreground data-[range-end=true]:bg-primary data-[range-end=true]:text-primary-foreground group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-ring/50 dark:hover:text-accent-foreground flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:ring-[3px] data-[range-end=true]:rounded-md data-[range-end=true]:rounded-r-md data-[range-middle=true]:rounded-none data-[range-start=true]:rounded-md data-[range-start=true]:rounded-l-md [&>span]:text-xs [&>span]:opacity-70",
        s.day,
        c
      ),
      ...l
    }
  );
}
export {
  j as Calendar,
  v as CalendarDayButton
};
