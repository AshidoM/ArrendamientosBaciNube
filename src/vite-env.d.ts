/// <reference types="vite/client" />
declare global {
  interface Window {
    baci: {
      updates: {
        check(): Promise<{ ok: boolean; error?: string }>;
        quitAndInstall(): Promise<{ ok: boolean; error?: string }>;
        onStatus(cb: (s: string) => void): () => void;
        onProgress(cb: (i: { percent: number; transferred: number; total: number }) => void): () => void;
      };
    };
  }
}
export {};
