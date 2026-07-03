import * as v from 'valibot';

export function createJsonResultSchema<
  T extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
  E extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>> = v.StringSchema<undefined>,
>(data: T, err?: E) {
  return v.variant('success', [
    v.object({ success: v.literal(true), data }),
    v.object({ success: v.literal(false), error: err ?? v.string() }),
  ]);
}
