// src/services/import/retry.ts
export type RetryOptions = {
  retries?: number;        // default 3
  baseDelayMs?: number;    // default 300
  maxDelayMs?: number;     // default 4000
  jitter?: boolean;        // default true
  isRetryable?: (e: any) => boolean;
};

const defaultRetryable = (e: any) => {
  const msg = String(e?.message || e || "").toLowerCase();
  return (
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("timeout") ||
    msg.includes("429") ||
    msg.includes("5") // 5xx
  );
};

export async function callWithRetry<T>(fn: () => Promise<T>, opt: RetryOptions = {}): Promise<T> {
  const retries = opt.retries ?? 3;
  const base = opt.baseDelayMs ?? 300;
  const max = opt.maxDelayMs ?? 4000;
  const jitter = opt.jitter ?? true;
  const isRetryable = opt.isRetryable ?? defaultRetryable;

  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (e: any) {
      attempt++;
      if (attempt > retries || !isRetryable(e)) throw e;
      const backoff = Math.min(max, base * Math.pow(2, attempt - 1));
      const delay = jitter ? backoff * (0.7 + Math.random() * 0.6) : backoff;
      await new Promise(res => setTimeout(res, delay));
    }
  }
}
