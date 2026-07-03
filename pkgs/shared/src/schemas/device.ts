import * as v from 'valibot';

export const subscribeSchema = v.object({
  name: v.string('name must be a string'),
  endpoint: v.string('endpoint must be a string'),
  subscription: v.any(),
  topics: v.array(v.string()),
});

export const deleteSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
});
