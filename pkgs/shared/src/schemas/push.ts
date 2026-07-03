import * as v from 'valibot';

export const sendSchema = v.object({
  title: v.optional(v.string()),
  body: v.string('body is required'),
  url: v.optional(v.string()),
  priority: v.optional(v.union([v.number(), v.string()])),
  tags: v.optional(v.string()),
  timestamp: v.optional(v.string()),
  sign: v.optional(v.string()),
});

export const sendQuerySchema = v.object({
  topic: v.optional(v.string()),
});
