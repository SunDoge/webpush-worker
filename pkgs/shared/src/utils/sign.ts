export async function generateSignature(timestampStr: string, secret: string): Promise<string> {
  const stringToSign = `${timestampStr}\n${secret}`;

  const encoder = new TextEncoder();
  const secretKeyData = encoder.encode(secret);
  const messageData = encoder.encode(stringToSign);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    secretKeyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);

  const expectedSign = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

  return expectedSign;
}

export async function verifySignature(
  timestampStr: string,
  clientSign: string,
  secret: string,
  now: number = Date.now(),
): Promise<boolean> {
  const timestamp = Number(timestampStr);

  // 1. 防重放：限制时间戳误差在 5 分钟（300,000 毫秒）内
  if (Number.isNaN(timestamp) || Math.abs(now - timestamp) > 300 * 1000) {
    return false;
  }

  // 2. 计算预期的签名
  const expectedSign = await generateSignature(timestampStr, secret);

  // 3. 比对签名是否一致（clientSign 传输时可能有 URL 解码，需注意比对）
  return expectedSign === decodeURIComponent(clientSign);
}
