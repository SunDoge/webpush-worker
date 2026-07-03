import * as v from 'valibot';

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

export const refreshSchema = v.object({
  refreshToken: v.string(),
});

export const createTokenSchema = v.object({
  name: v.string(),
});
