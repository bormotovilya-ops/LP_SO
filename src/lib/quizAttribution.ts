/** UTM с URL сайта (квиз, лендинг с формой диагностики); sessionStorage на время сессии. */

export type StoredQuizUtm = {
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  utmTerm?: string | null;
};

const SESSION_UTM_KEY = "lp_quiz_utm_v1";
const SESSION_CTX_KEY = "lp_quiz_bot_ctx_v1";

function paramsToUtm(params: URLSearchParams): StoredQuizUtm {
  const g = (k: string) => {
    const v = params.get(k)?.trim();
    return v || undefined;
  };
  return {
    utmSource: g("utm_source"),
    utmMedium: g("utm_medium"),
    utmCampaign: g("utm_campaign"),
    utmContent: g("utm_content"),
    utmTerm: g("utm_term"),
  };
}

/** Читает utm_* из `?query` и из `#/path?query` (hash-router). */
export function captureQuizUtmsFromLocation(): StoredQuizUtm {
  const fromSearch = paramsToUtm(new URLSearchParams(window.location.search));
  let fromHash: StoredQuizUtm = {};
  const hash = window.location.hash;
  const qi = hash.indexOf("?");
  if (qi !== -1) {
    fromHash = paramsToUtm(new URLSearchParams(hash.slice(qi + 1)));
  }
  return { ...fromSearch, ...fromHash };
}

export function hasAnyUtm(u: StoredQuizUtm): boolean {
  return Boolean(u.utmSource || u.utmMedium || u.utmCampaign || u.utmContent || u.utmTerm);
}

export function utmFingerprint(u: StoredQuizUtm): string {
  return JSON.stringify([
    u.utmSource ?? "",
    u.utmMedium ?? "",
    u.utmCampaign ?? "",
    u.utmContent ?? "",
    u.utmTerm ?? "",
  ]);
}

export function mergeSessionQuizUtms(stored: StoredQuizUtm, incoming: StoredQuizUtm): StoredQuizUtm {
  const out: StoredQuizUtm = { ...stored };
  (["utmSource", "utmMedium", "utmCampaign", "utmContent", "utmTerm"] as const).forEach((k) => {
    const v = incoming[k];
    if (v) out[k] = v;
  });
  return out;
}

export function loadStoredQuizUtm(): StoredQuizUtm {
  try {
    const raw = sessionStorage.getItem(SESSION_UTM_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as StoredQuizUtm;
  } catch {
    return {};
  }
}

export function persistQuizUtm(u: StoredQuizUtm): void {
  if (!hasAnyUtm(u)) return;
  sessionStorage.setItem(SESSION_UTM_KEY, JSON.stringify(u));
}

export function loadCachedBotContextToken(fp: string): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CTX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { fp?: string; token?: string };
    if (parsed.fp === fp && typeof parsed.token === "string" && /^[a-f0-9]{12}$/i.test(parsed.token)) {
      return parsed.token.toLowerCase();
    }
    return null;
  } catch {
    return null;
  }
}

export function persistBotContextToken(fp: string, token: string): void {
  sessionStorage.setItem(SESSION_CTX_KEY, JSON.stringify({ fp, token: token.toLowerCase() }));
}

/** Состояние до первого fetch токена: без UTM или есть кеш — сразу можно открывать бота. */
export type QuizAttributionBootstrap = {
  merged: StoredQuizUtm;
  botCtxToken: string | null;
  botCtxResolved: boolean;
};

export function computeQuizAttributionBootstrap(): QuizAttributionBootstrap {
  const merged = mergeSessionQuizUtms(loadStoredQuizUtm(), captureQuizUtmsFromLocation());
  if (!hasAnyUtm(merged)) {
    return { merged, botCtxToken: null, botCtxResolved: true };
  }
  const cached = loadCachedBotContextToken(utmFingerprint(merged));
  if (cached) {
    return { merged, botCtxToken: cached, botCtxResolved: true };
  }
  return { merged, botCtxToken: null, botCtxResolved: false };
}
