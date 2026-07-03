export async function verifyTurnstile(
  token: string | undefined,
  secretKey: string | undefined,
  remoteIp?: string,
): Promise<boolean> {
  // 如果服务端没有配置 Turnstile Secret Key，则判定为开发环境，免检直接放行
  if (!secretKey) {
    return true;
  }
  if (!token) {
    return false;
  }

  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) {
      formData.append('remoteip', remoteIp);
    }

    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });

    const data: any = await res.json();
    return !!data.success;
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return false;
  }
}
