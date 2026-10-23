import { z as a } from "zod";
const e = a.object({
  id: a.string().min(1, "ID is required"),
  date: a.string().regex(/^[A-Z]+ \d+( \d{4})?$/, 'Date must be in format "MONTH DAY YEAR"'),
  title: a.string().min(10, "Title must be at least 10 characters").max(200, "Title must be less than 200 characters"),
  description: a.string().max(2e3, "Description must be less than 2000 characters"),
  tags: a.array(a.string()).min(1, "At least one tag is required").max(5, "Maximum of 5 tags").optional()
}), r = a.object({
  sourceData: a.url(),
  refetchInterval: a.number().optional(),
  fallbackData: a.array(e).optional(),
  onError: a.function().optional(),
  showLoading: a.boolean().optional()
}), n = a.object({
  changes: a.array(e)
});
export {
  r as ChangeFeedContainerSchema,
  n as ChangeFeedDataSchema,
  e as ChangeFeedItemSchema
};
