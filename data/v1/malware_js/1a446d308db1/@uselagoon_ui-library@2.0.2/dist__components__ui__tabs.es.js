import { jsx as a } from "react/jsx-runtime";
import * as s from "@radix-ui/react-tabs";
import { cn as i } from "../../lib/utils.es.js";
function o({ className: t, ...e }) {
  return /* @__PURE__ */ a(s.Root, { "data-slot": "tabs", className: i("flex flex-col gap-2", t), ...e });
}
function d({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    s.List,
    {
      "data-slot": "tabs-list",
      className: i(
        "bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-lg p-[3px]",
        t
      ),
      ...e
    }
  );
}
function c({ className: t, ...e }) {
  return /* @__PURE__ */ a(
    s.Trigger,
    {
      "data-slot": "tabs-trigger",
      className: i(
        "data-[state=active]:bg-background dark:data-[state=active]:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:outline-ring dark:data-[state=active]:border-input dark:data-[state=active]:bg-input/30 text-foreground dark:text-muted-foreground inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-sm [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        t
      ),
      ...e
    }
  );
}
function l({ className: t, ...e }) {
  return /* @__PURE__ */ a(s.Content, { "data-slot": "tabs-content", className: i("flex-1 outline-none", t), ...e });
}
export {
  o as Tabs,
  l as TabsContent,
  d as TabsList,
  c as TabsTrigger
};
