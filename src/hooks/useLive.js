import { useEffect, useRef } from 'react';
import { MUTATION_EVENT } from '../api/client';

/**
 * Keeps a piece of UI in sync without a page reload.
 *
 * `refresh` is called (never on mount — the caller does its own first load):
 *   - right after any successful write the app makes (api.post/put/patch/del)
 *     whose path matches `watch` (a RegExp; omit to react to every write),
 *   - when the tab becomes visible again / the window regains focus,
 *   - every `interval` ms while the tab is visible (omit/0 to disable) —
 *     this is how changes made by *other* people or devices show up.
 * Bursts of events are coalesced into one refresh (`debounce`, default 250ms).
 */
export function useLive(refresh, { watch, interval = 0, debounce = 250, enabled = true } = {}) {
  const ref = useRef(refresh);
  ref.current = refresh;
  const watchSrc = watch ? watch.source : '';

  useEffect(() => {
    if (!enabled) return undefined;
    const re = watchSrc ? new RegExp(watchSrc) : null;
    let timer = null;
    const fire = () => {
      clearTimeout(timer);
      timer = setTimeout(() => ref.current?.(), debounce);
    };
    const onMutation = (e) => {
      const path = e.detail?.path || '';
      if (!re || re.test(path)) fire();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') fire(); };

    window.addEventListener(MUTATION_EVENT, onMutation);
    window.addEventListener('focus', fire);
    document.addEventListener('visibilitychange', onVisible);
    const poll = interval > 0
      ? setInterval(() => { if (document.visibilityState === 'visible') ref.current?.(); }, interval)
      : null;

    return () => {
      clearTimeout(timer);
      if (poll) clearInterval(poll);
      window.removeEventListener(MUTATION_EVENT, onMutation);
      window.removeEventListener('focus', fire);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, watchSrc, interval, debounce]);
}

// Writes that can change what the shell (topbar / sidebar) shows about the person.
export const PROFILE_WRITE = /\/(profile|me|avatar|settings|account|preferences|portfolio)(\/|$|\?)/;
