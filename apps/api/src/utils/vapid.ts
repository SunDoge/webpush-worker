// @ts-expect-error
import { ApplicationServerKeys } from 'webpush-webcrypto';

export function decodeBase64URL(str: string): Uint8Array {
  let deURLed = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = 4 - (deURLed.length % 4);
  if (pad !== 4) deURLed += '='.repeat(pad);
  const binary = atob(deURLed);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function base64urlEncode(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export async function loadVapidKeys(
  publicKeyBase64: string,
  privateKeyBase64: string,
): Promise<any> {
  if (!publicKeyBase64 || !privateKeyBase64) {
    throw new Error('VAPID_PUBLIC_KEY or VAPID_SECRET_KEY is missing in environment variables.');
  }

  const rawPub = decodeBase64URL(publicKeyBase64);
  const x = base64urlEncode(rawPub.slice(1, 33));
  const y = base64urlEncode(rawPub.slice(33, 65));

  const publicKey = await crypto.subtle.importKey(
    'raw',
    rawPub as any,
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    [],
  );

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x,
      y,
      d: privateKeyBase64,
    },
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign'],
  );

  return new ApplicationServerKeys(publicKey, privateKey);
}

export function priorityToUrgency(priority: number): 'very-low' | 'low' | 'normal' | 'high' {
  if (priority <= 1) return 'very-low';
  if (priority === 2) return 'low';
  if (priority === 3) return 'normal';
  return 'high';
}
