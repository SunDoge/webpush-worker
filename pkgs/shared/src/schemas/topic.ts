import * as v from 'valibot';

export const createTopicSchema = v.object({
  name: v.pipe(
    v.string(),
    v.minLength(1, 'topic name cannot be empty'),
    v.regex(
      /^[a-zA-Z0-9_-]+$/,
      'topic name can only contain alphanumeric characters, underscores and hyphens',
    ),
  ),
});
