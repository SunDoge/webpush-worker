import { sign } from 'hono/jwt';
import type { UserInfo } from '../middleware/auth';

const ACCESS_TOKEN_TTL = 60 * 15; // 15 minutes
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30; // 30 days

export interface TokenPair {
  token: string;
  refreshToken: string;
}

export async function issueTokenPair(subject: UserInfo, jwtSecret: string): Promise<TokenPair> {
  const now = Math.floor(Date.now() / 1000);

  const token = await sign({ ...subject, exp: now + ACCESS_TOKEN_TTL }, jwtSecret, 'HS256');

  const refreshToken = await sign(
    { ...subject, is_refresh_token: true, exp: now + REFRESH_TOKEN_TTL },
    jwtSecret,
    'HS256',
  );

  return { token, refreshToken };
}
