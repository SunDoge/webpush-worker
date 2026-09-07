interface NavigatorUAData {
  brands: Array<{ brand: string; version: string }>;
  mobile: boolean;
  platform: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
}

function detectBrowser(userAgent: string, brands: NavigatorUAData['brands'] = []): string {
  const brandNames = brands.map(({ brand }) => brand).filter((brand) => !/not.?a.?brand/i.test(brand));
  const knownBrand =
    brandNames.find((brand) => /edge/i.test(brand)) ??
    brandNames.find((brand) => /opera/i.test(brand)) ??
    brandNames.find((brand) => /samsung/i.test(brand)) ??
    brandNames.find((brand) => /chrome/i.test(brand));

  if (knownBrand) {
    return knownBrand
      .replace(/Google Chrome/i, 'Chrome')
      .replace(/Microsoft Edge/i, 'Edge')
      .replace(/Opera Mobile/i, 'Opera');
  }
  if (/Edg(?:A|iOS)?\//.test(userAgent)) return 'Edge';
  if (/OPR\//.test(userAgent)) return 'Opera';
  if (/SamsungBrowser\//.test(userAgent)) return 'Samsung Internet';
  if (/CriOS\//.test(userAgent)) return 'Chrome';
  if (/FxiOS\//.test(userAgent)) return 'Firefox';
  if (/Firefox\//.test(userAgent)) return 'Firefox';
  if (/Chrome\//.test(userAgent)) return 'Chrome';
  if (/Safari\//.test(userAgent)) return 'Safari';
  return 'Browser';
}

function detectOS(userAgent: string, platform?: string): string {
  if (/iPad/.test(userAgent)) return 'iPadOS';
  if (/iPhone|iPod/.test(userAgent)) return 'iOS';
  if (/Android/.test(userAgent)) return 'Android';

  const platformName = platform || '';
  if (/Chrome OS/i.test(platformName) || /CrOS/.test(userAgent)) return 'ChromeOS';
  if (/Windows/i.test(platformName) || /Windows/.test(userAgent)) return 'Windows';
  if (/macOS|Mac/i.test(platformName) || /Macintosh/.test(userAgent)) return 'macOS';
  if (/Linux/i.test(platformName) || /Linux/.test(userAgent)) return 'Linux';
  return platformName || 'Unknown OS';
}

function detectAndroidModel(userAgent: string): string | undefined {
  const match = userAgent.match(/Android[^;]*;\s*([^;)]+?)\s+Build\//i);
  return match?.[1]?.replace(/^wv\s+/i, '').trim();
}

export async function getDefaultDeviceName(): Promise<string> {
  const userAgent = navigator.userAgent;
  const uaData = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  const browser = detectBrowser(userAgent, uaData?.brands);
  const os = detectOS(userAgent, uaData?.platform);

  let model = detectAndroidModel(userAgent);
  if (uaData?.getHighEntropyValues) {
    try {
      const values = await uaData.getHighEntropyValues(['model']);
      model = values.model?.trim() || model;
    } catch {
      // High-entropy client hints can be unavailable or denied; the fallback is sufficient.
    }
  }

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  return [browser, os, model, isStandalone ? 'PWA' : undefined].filter(Boolean).join(' · ');
}
