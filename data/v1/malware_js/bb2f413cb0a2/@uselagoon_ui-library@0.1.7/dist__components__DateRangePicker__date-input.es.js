import { jsxs as p, jsx as s } from "react/jsx-runtime";
import x, { useRef as u, useEffect as T } from "react";
const N = ({ value: c, onChange: i }) => {
  const [r, a] = x.useState(() => {
    const t = c ? new Date(c) : /* @__PURE__ */ new Date();
    return {
      day: t.getDate(),
      month: t.getMonth() + 1,
      // JavaScript months are 0-indexed
      year: t.getFullYear()
    };
  }), w = u(null), l = u(null), d = u(null);
  T(() => {
    const t = c ? new Date(c) : /* @__PURE__ */ new Date();
    a({
      day: t.getDate(),
      month: t.getMonth() + 1,
      year: t.getFullYear()
    });
  }, [c]);
  const D = (t, n) => {
    if (t === "day" && (n < 1 || n > 31) || t === "month" && (n < 1 || n > 12) || t === "year" && (n < 1e3 || n > 9999))
      return !1;
    const e = { ...r, [t]: n }, o = new Date(e.year, e.month - 1, e.day);
    return o.getFullYear() === e.year && o.getMonth() + 1 === e.month && o.getDate() === e.day;
  }, h = (t) => (n) => {
    const e = n.target.value ? Number(n.target.value) : "", o = typeof e == "number" && D(t, e), y = { ...r, [t]: e };
    a(y), o && i(new Date(y.year, y.month - 1, y.day));
  }, m = u(r), g = (t) => (n) => {
    if (!n.target.value) {
      a(m.current);
      return;
    }
    const e = Number(n.target.value);
    D(t, e) ? m.current = { ...r, [t]: e } : a(m.current);
  }, f = (t) => (n) => {
    if (!(n.metaKey || n.ctrlKey)) {
      if (!/^[0-9]$/.test(n.key) && !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Delete", "Tab", "Backspace", "Enter"].includes(n.key)) {
        n.preventDefault();
        return;
      }
      if (n.key === "ArrowUp") {
        n.preventDefault();
        let e = { ...r };
        t === "day" && (r[t] === new Date(r.year, r.month, 0).getDate() ? (e = { ...e, day: 1, month: r.month % 12 + 1 }, e.month === 1 && (e.year += 1)) : e.day += 1), t === "month" && (r[t] === 12 ? e = { ...e, month: 1, year: r.year + 1 } : e.month += 1), t === "year" && (e.year += 1), a(e), i(new Date(e.year, e.month - 1, e.day));
      } else if (n.key === "ArrowDown") {
        n.preventDefault();
        let e = { ...r };
        t === "day" && (r[t] === 1 ? (e.month -= 1, e.month === 0 && (e.month = 12, e.year -= 1), e.day = new Date(e.year, e.month, 0).getDate()) : e.day -= 1), t === "month" && (r[t] === 1 ? e = { ...e, month: 12, year: r.year - 1 } : e.month -= 1), t === "year" && (e.year -= 1), a(e), i(new Date(e.year, e.month - 1, e.day));
      }
      n.key === "ArrowRight" ? (n.currentTarget.selectionStart === n.currentTarget.value.length || n.currentTarget.selectionStart === 0 && n.currentTarget.selectionEnd === n.currentTarget.value.length) && (n.preventDefault(), t === "month" && l.current?.focus(), t === "day" && d.current?.focus()) : n.key === "ArrowLeft" && (n.currentTarget.selectionStart === 0 || n.currentTarget.selectionStart === 0 && n.currentTarget.selectionEnd === n.currentTarget.value.length) && (n.preventDefault(), t === "day" && w.current?.focus(), t === "year" && l.current?.focus());
    }
  };
  return /* @__PURE__ */ p("div", { className: "flex border rounded-lg items-center text-sm px-1", children: [
    /* @__PURE__ */ s(
      "input",
      {
        type: "text",
        ref: w,
        max: 12,
        maxLength: 2,
        value: r.month.toString(),
        onChange: h("month"),
        onKeyDown: f("month"),
        onFocus: (t) => {
          window.innerWidth > 1024 && t.target.select();
        },
        onBlur: g("month"),
        className: "p-0 outline-none w-6 border-none text-center",
        placeholder: "M"
      }
    ),
    /* @__PURE__ */ s("span", { className: "opacity-20 -mx-px", children: "/" }),
    /* @__PURE__ */ s(
      "input",
      {
        type: "text",
        ref: l,
        max: 31,
        maxLength: 2,
        value: r.day.toString(),
        onChange: h("day"),
        onKeyDown: f("day"),
        onFocus: (t) => {
          window.innerWidth > 1024 && t.target.select();
        },
        onBlur: g("day"),
        className: "p-0 outline-none w-7 border-none text-center",
        placeholder: "D"
      }
    ),
    /* @__PURE__ */ s("span", { className: "opacity-20 -mx-px", children: "/" }),
    /* @__PURE__ */ s(
      "input",
      {
        type: "text",
        ref: d,
        max: 9999,
        maxLength: 4,
        value: r.year.toString(),
        onChange: h("year"),
        onKeyDown: f("year"),
        onFocus: (t) => {
          window.innerWidth > 1024 && t.target.select();
        },
        onBlur: g("year"),
        className: "p-0 outline-none w-12 border-none text-center",
        placeholder: "YYYY"
      }
    )
  ] });
};
N.displayName = "DateInput";
export {
  N as DateInput
};
