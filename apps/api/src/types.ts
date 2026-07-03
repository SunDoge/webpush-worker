export type UserInfo = {
  id: string;
  username: string;
  role: string;
};

/** Hono env for routes that require an authenticated user. */
export type AuthEnv = {
  Bindings: CloudflareBindings;
  Variables: { user: UserInfo };
};

/** Hono env for public routes (no user in context). */
export type PublicEnv = {
  Bindings: CloudflareBindings;
};

export type JsonResult<T, E> = {
  success: boolean;
  data?: T;
  error?: E;
};
