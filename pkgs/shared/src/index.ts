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

export const sendSchema = v.object({
  title: v.optional(v.string()),
  body: v.string('body is required'),
  url: v.optional(v.string()),
  priority: v.optional(v.union([v.number(), v.string()])),
  tags: v.optional(v.string()),
});

export const registerSchema = v.object({
  username: v.pipe(v.string(), v.minLength(1, 'username cannot be empty')),
  password: v.pipe(v.string(), v.minLength(1, 'password cannot be empty')),
  code: v.optional(v.string()),
  turnstileToken: v.optional(v.string()),
});

export const loginSchema = v.object({
  username: v.pipe(v.string(), v.minLength(1, 'username cannot be empty')),
  password: v.pipe(v.string(), v.minLength(1, 'password cannot be empty')),
  turnstileToken: v.optional(v.string()),
});

export const sendQuerySchema = v.object({
  topic: v.optional(v.string()),
});

export const refreshSchema = v.object({
  refreshToken: v.string(),
});

export const createTokenSchema = v.object({
  name: v.string(),
});

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
