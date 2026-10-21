interface Grecaptcha {
  ready(cb: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
}

declare global {
  var grecaptcha: Grecaptcha | undefined;
}

const SITE_KEY: string | undefined = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

export const RECAPTCHA_UNAVAILABLE =
  'Verificarea anti-robot nu s-a putut încărca. Reîncărcați pagina și reîncercați.';

let loading: Promise<Grecaptcha> | null = null;

export function loadRecaptcha(): Promise<Grecaptcha> {
  if (!SITE_KEY) return Promise.reject(new Error(RECAPTCHA_UNAVAILABLE));
  loading ??= new Promise<Grecaptcha>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(SITE_KEY)}`;
    script.async = true;
    script.onload = () => {
      const g = globalThis.grecaptcha;
      if (g) g.ready(() => resolve(g));
      else reject(new Error(RECAPTCHA_UNAVAILABLE));
    };
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error(RECAPTCHA_UNAVAILABLE));
    };
    document.head.append(script);
  });
  return loading;
}

export async function recaptchaToken(action: string): Promise<string> {
  const g = await loadRecaptcha();
  try {
    return await g.execute(SITE_KEY!, { action });
  } catch {
    throw new Error(RECAPTCHA_UNAVAILABLE);
  }
}
