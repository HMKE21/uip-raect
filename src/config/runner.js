// The project IDE runs student code on a SEPARATE origin (the "uip-runner" static site) so it can never read the
// UIP session. Set VITE_RUNNER_URL (e.g. https://uip-runner.vercel.app) to enable the Run button.
let url = String(import.meta.env.VITE_RUNNER_URL || '').trim().replace(/\/+$/, '');
let origin = '';
try { if (url) origin = new URL(url).origin; } catch { url = ''; }

export const RUNNER_URL = url ? `${url}/` : '';
export const RUNNER_ORIGIN = origin;
