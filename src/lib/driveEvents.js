/** Fired after EVERY successful write to My PC (save / upload / ZIP sync). The Save Center shows the "Saved" toast, the cloud backup engine reacts. */
export const DRIVE_SAVED = 'uip-drive-saved';

/** detail: { id, name, kind: 'replace' | 'upload' | 'sync', size?, silent? } — silent writes (the account-settings file) stay quiet. */
export function emitDriveSaved(detail) {
  try { window.dispatchEvent(new CustomEvent(DRIVE_SAVED, { detail })); } catch { /* no window (SSR / tests) */ }
}

/** Fired when an upload to My PC fails for good (not when the student cancels it). Feeds the desktop notification center. */
export const DRIVE_FAILED = 'uip-drive-failed';

/** detail: { name, kind: 'upload', message? } */
export function emitDriveFailed(detail) {
  try { window.dispatchEvent(new CustomEvent(DRIVE_FAILED, { detail })); } catch { /* no window (SSR / tests) */ }
}
