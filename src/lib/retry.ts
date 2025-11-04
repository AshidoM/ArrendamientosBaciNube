export type JitterMode = "none" | "full" | "equal" | "decorrelated";

export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: JitterMode;
  timeoutPerAttemptMs?: number;
  shouldRetry?: (error: unknown, attempt: number) => boolean | Promise<boolean>;
  onRetry?: (ctx: {
    attempt: number;
    error: unknown;
    delayMs: number;
    nextAttemptAt: number;
  }) => void | Promise<void>;
};

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function nowMs(): number {
  return Date.now();
}

function isAxiosErr(e: any): boolean {
  return !!e && typeof e === "object" && (e.isAxiosError || e.config || e.response || e.request);
}

function statusFromErr(e: any): number | undefined {
  if (!e) return undefined;
  if (e.status && typeof e.status === "number") return e.status;
  if (e.response && typeof e.response.status === "number") return e.response.status;
  return undefined;
}

function codeFromErr(e: any): string | undefined {
  if (!e) return undefined;
  if (typeof e.code === "string") return e.code;
  if (e.cause && typeof e.cause.code === "string") return e.cause.code;
  return undefined;
}

function defaultShouldRetry(e: unknown, attempt: number): boolean {
  const any = e as any;
  const status = statusFromErr(any);
  const code = codeFromErr(any);
  if (status === 401 || status === 403 || status === 400) return false;
  if (status === 404) return attempt === 0;
  if (status === 408) return true;
  if (status === 409) return attempt < 2;
  if (status === 425 || status === 429) return true;
  if (status && status >= 500) return true;
  if (code === "ECONNRESET" || code === "EAI_AGAIN" || code === "ETIMEDOUT" || code === "ENETUNREACH") return true;
  if (any && typeof any === "object" && (any.name === "AbortError" || any.name === "CanceledError")) return false;
  if (isAxiosErr(any) && !status) return true;
  return false;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function rand01(): number {
  return Math.random();
}

function computeDelay(attempt: number, base: number, max: number, factor: number, mode: JitterMode, prevDelay?: number): number {
  const exp = Math.pow(factor, attempt);
  const raw = base * exp;
  const capped = clamp(raw, base, max);
  if (mode === "none") return capped;
  if (mode === "equal") return clamp(capped / 2 + rand01() * (capped / 2), base, max);
  if (mode === "decorrelated") {
    const from = prevDelay ? Math.max(base, prevDelay * factor) : base;
    return clamp(rand01() * from, base, max);
  }
  return clamp(rand01() * capped, base, max);
}

async function withTimeout<T>(p: Promise<T>, ms?: number): Promise<T> {
  if (!ms || ms <= 0) return p;
  let to: any;
  const t = new Promise<never>((_, rej) => {
    to = setTimeout(() => rej(Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" })), ms);
  });
  try {
    const res = await Promise.race([p, t]);
    clearTimeout(to);
    return res as T;
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
}

export async function retryAsync<T>(op: () => Promise<T>, opts?: RetryOptions): Promise<T> {
  const {
    retries = 5,
    baseDelayMs = 250,
    maxDelayMs = 10_000,
    factor = 2,
    jitter = "full",
    timeoutPerAttemptMs,
    shouldRetry = defaultShouldRetry,
    onRetry,
  } = opts || {};
  let lastErr: unknown;
  let prevDelay: number | undefined = undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await withTimeout(op(), timeoutPerAttemptMs);
      return res;
    } catch (e) {
      lastErr = e;
      const can = await Promise.resolve(shouldRetry(e, attempt));
      if (!can || attempt >= retries) break;
      const delayMs = computeDelay(attempt, baseDelayMs, maxDelayMs, factor, jitter, prevDelay);
      prevDelay = delayMs;
      if (onRetry) {
        await Promise.resolve(
          onRetry({
            attempt: attempt + 1,
            error: e,
            delayMs,
            nextAttemptAt: nowMs() + delayMs,
          })
        );
      }
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

export function withRetry<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  opts?: RetryOptions
): (...args: TArgs) => Promise<TReturn> {
  return async (...args: TArgs) => retryAsync(() => fn(...args), opts);
}

export default withRetry;
