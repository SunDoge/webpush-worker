import * as v from 'valibot';

export const subscribeSchema = v.object({
  name: v.pipe(v.string('name must be a string'), v.trim(), v.minLength(1), v.maxLength(80)),
  endpoint: v.string('endpoint must be a string'),
  subscription: v.any(),
  topics: v.string(),
});

export const renameDeviceSchema = v.object({
  name: v.pipe(v.string('name must be a string'), v.trim(), v.minLength(1), v.maxLength(80)),
});

export const deleteSchema = v.object({
  id: v.pipe(v.string(), v.uuid()),
});
