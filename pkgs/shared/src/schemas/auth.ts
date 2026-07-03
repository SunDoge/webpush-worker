import * as v from 'valibot';

export const registerSchema = v.object({
  username: v.pipe(v.string(), v.minLength(1, '用户名不能为空')),
  password: v.pipe(v.string(), v.minLength(1, '密码不能为空')),
  code: v.optional(v.string()),
  turnstileToken: v.optional(v.string()),
});

export const loginSchema = v.object({
  username: v.pipe(v.string(), v.minLength(1, '用户名不能为空')),
  password: v.pipe(v.string(), v.minLength(1, '密码不能为空')),
  turnstileToken: v.optional(v.string()),
});

export const refreshSchema = v.object({
  refreshToken: v.string(),
});

export const createTokenSchema = v.object({
  name: v.string(),
});
