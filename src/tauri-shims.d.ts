// Minimal TypeScript shims for the @tauri-apps/api sub-modules used in this repo.
// These declarations stop `tsc` from erroring when the full type packages
// are not available during local builds. They are intentionally minimal — if
// you have the official types from `@tauri-apps/api`, you can remove this file.

declare module "@tauri-apps/api/tauri" {
  export function invoke<T = unknown>(cmd: string, params?: Record<string, unknown>): Promise<T>;
}

declare module "@tauri-apps/api/event" {
  export function listen<T = unknown>(
    event: string,
    handler: (e: { event: string; payload: T }) => void
  ): Promise<() => void>;
  export function emit(event: string, payload?: unknown): Promise<void>;
}
