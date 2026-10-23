import { jsx as n } from "react/jsx-runtime";
import { Slot as g } from "@radix-ui/react-slot";
import { cva as d } from "class-variance-authority";
import { cn as v } from "../../lib/utils.es.js";
const b = d(
  "inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,background-color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary: "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive: "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        outline: "border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        neutral: "[background:var(--badge-neutral-bg)] [color:var(--badge-neutral-fg)] [a&]:hover:[background:var(--badge-neutral-hover)] [box-shadow:var(--badge-ring)]",
        info: "[background:var(--badge-info-bg)] [color:var(--badge-info-fg)] [a&]:hover:[background:var(--badge-info-hover)] [box-shadow:var(--badge-ring)]",
        success: "[background:var(--badge-success-bg)] [color:var(--badge-success-fg)] [a&]:hover:[background:var(--badge-success-hover)] [box-shadow:var(--badge-ring)]",
        warning: "[background:var(--badge-warning-bg)] [color:var(--badge-warning-fg)] [a&]:hover:[background:var(--badge-warning-hover)] [box-shadow:var(--badge-ring)]",
        danger: "[background:var(--badge-danger-bg)] [color:var(--badge-danger-fg)] [a&]:hover:[background:var(--badge-danger-hover)] [box-shadow:var(--badge-ring)]",
        purple: "[background:var(--badge-purple-bg)] [color:var(--badge-purple-fg)] [a&]:hover:[background:var(--badge-purple-hover)] [box-shadow:var(--badge-ring)]",
        teal: "[background:var(--badge-teal-bg)] [color:var(--badge-teal-fg)] [a&]:hover:[background:var(--badge-teal-hover)] [box-shadow:var(--badge-ring)]",
        lagoon: "[background:var(--badge-lagoon-bg)] [color:var(--badge-lagoon-fg)] [a&]:hover:[background:var(--badge-lagoon-hover)] [box-shadow:var(--badge-ring)]",
        production: "[background:var(--env-production-bg)] [color:var(--env-production-fg)] [a&]:hover:[background:var(--env-production-hover)] [box-shadow:var(--badge-ring)]",
        development: "[background:var(--env-development-bg)] [color:var(--env-development-fg)] [a&]:hover:[background:var(--env-development-hover)] [box-shadow:var(--badge-ring)]",
        staging: "[background:var(--env-staging-bg)] [color:var(--env-staging-fg)] [a&]:hover:[background:var(--env-staging-hover)] [box-shadow:var(--badge-ring)]",
        failover: "[background:var(--env-failover-bg)] [color:var(--env-failover-fg)] [a&]:hover:[background:var(--env-failover-hover)] [box-shadow:var(--badge-ring)]",
        standby: "[background:var(--env-standby-bg)] [color:var(--env-standby-fg)] [a&]:hover:[background:var(--env-standby-hover)] [box-shadow:var(--badge-ring)]",
        testing: "[background:var(--env-testing-bg)] [color:var(--env-testing-fg)] [a&]:hover:[background:var(--env-testing-hover)] [box-shadow:var(--badge-ring)]",
        sandbox: "[background:var(--env-sandbox-bg)] [color:var(--env-sandbox-fg)] [a&]:hover:[background:var(--env-sandbox-hover)] [box-shadow:var(--badge-ring)]",
        deprecated: "[background:var(--env-deprecated-bg)] [color:var(--env-deprecated-fg)] [a&]:hover:[background:var(--env-deprecated-hover)] [box-shadow:var(--badge-ring)]"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function l({
  className: r,
  variant: a,
  asChild: e = !1,
  ...o
}) {
  return /* @__PURE__ */ n(e ? g : "span", { "data-slot": "badge", className: v(b({ variant: a }), r), ...o });
}
export {
  l as Badge,
  b as badgeVariants
};
