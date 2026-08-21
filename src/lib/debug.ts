// Ported from the web app's src/utils/debug.ts. `__DEV__` is RN's built-in
// dev-mode global — the equivalent of Vite's `import.meta.env.DEV`.

export const debug = {
  log: (namespace: string, ...args: unknown[]) => {
    if (__DEV__) console.log(`[${namespace}]`, ...args);
  },
  warn: (namespace: string, ...args: unknown[]) => {
    if (__DEV__) console.warn(`[${namespace}]`, ...args);
  },
  error: (namespace: string, ...args: unknown[]) => {
    console.error(`[${namespace}]`, ...args);
  },
};
