import { z as t } from "zod";
const e = t.object({
  id: t.string().min(1, "ID is required"),
  date: t.string().regex(/^[A-Z]+ \d+( \d{4})?$/, 'Date must be in format "MONTH DAY YEAR"'),
  title: t.string().min(10, "Title must be at least 10 characters").max(200, "Title must be less than 200 characters"),
  description: t.string().max(2e3, "Description must be less than 2000 characters"),
  tags: t.array(t.string()).min(1, "At least one tag is required").max(5, "Maximum of 5 tags").optional()
}), s = t.object({
  changes: t.array(e).min(1, "At least one change is required")
});
export {
  s as ChangeLogDataSchema,
  e as ChangeLogItemSchema
};
