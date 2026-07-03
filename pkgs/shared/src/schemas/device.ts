import * as v from 'valibot';

export const subscribeSchema = v.object({
  id: v.string('id must be a string'),
  name: v.string('name must be a string'),
  endpoint: v.string('endpoint must be a string'),
  subscription: v.any(),
  topics: v.optional(v.string()),
});

export const unsubscribeSchema = v.object({
  endpoint: v.string('endpoint must be a string'),
});
