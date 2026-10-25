import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { api } from '../api/client';

/**
 * ONE WebSocket for the whole app (Laravel Reverb), subscribed to the person's own
 * private channel `App.Models.User.{id}`. The server pushes tiny "something changed"
 * pings (see App\Support\Realtime); this module turns each ping into a window event
 * `uip:rt` {topic, data}, and the screens react instantly:
 *
 *   topic 'messaging'    {conversation_id, kind: message|reaction|read|typing|change|inbox}
 *   topic 'notification' {id?, title?, body?, ...}   (a new one, or "re-sync" after a read on another device)
 *   topic 'drive'        {node_id?, kind: tree|content}   (My PC changed on this or another device)
 *   topic 'resync'       socket (re)connected → refresh everything once (covers any missed ping)
 *
 * The old polling stays as a safety net; it just rarely has anything to do now.
 */

window.Pusher = window.Pusher || Pusher;

export const RT_EVENT = 'uip:rt';

let echo = null;
let currentUid = null;
let connected = false;
let lastLocalDriveAt = 0;

const emit = (topic, data = {}) => {
  try { window.dispatchEvent(new CustomEvent(RT_EVENT, { detail: { topic, data } })); } catch { /* ignore */ }
};

// remember our own My PC writes so the server's echo of them doesn't trigger a second reload
if (typeof window !== 'undefined') {
  window.addEventListener('uip-drive-changed', (e) => { if (!e?.detail?.remote) lastLocalDriveAt = Date.now(); });
}

function handlePing(payload) {
  const topic = payload?.topic;
  const data = payload?.data || {};
  if (!topic) return;
  if (topic === 'drive') {
    if (Date.now() - lastLocalDriveAt > 800) {
      window.dispatchEvent(new CustomEvent('uip-drive-changed', { detail: { remote: true, ...data } }));
    }
    if (data.kind === 'content' && data.node_id) {
      window.dispatchEvent(new CustomEvent('uip-drive-node-changed', { detail: { id: data.node_id } }));
    }
  }
  emit(topic, data);
}

export function startRealtime(userId) {
  if (!userId) return;
  if (echo && currentUid === userId) return;
  stopRealtime();

  const key = import.meta.env.VITE_REVERB_APP_KEY || '';
  if (!key) return; // not configured: the polling fallback keeps everything working
  const host = import.meta.env.VITE_REVERB_HOST || window.location.hostname;
  const port = Number(import.meta.env.VITE_REVERB_PORT) || 443;
  const scheme = import.meta.env.VITE_REVERB_SCHEME || 'https';

  currentUid = userId;
  echo = new Echo({
    broadcaster: 'reverb',
    key,
    wsHost: host,
    wsPort: port,
    wssPort: port,
    forceTLS: scheme === 'https',
    enabledTransports: ['ws', 'wss'],
    // fast failure detection on flaky mobile networks
    activityTimeout: 25000,
    pongTimeout: 8000,
    authorizer: (channel) => ({
      authorize: (socketId, callback) => {
        api.post('/api/v1/realtime/auth', { socket_id: socketId, channel_name: channel.name })
          .then((payload) => callback(false, payload))
          .catch((err) => callback(true, err));
      },
    }),
  });

  echo.private(`App.Models.User.${userId}`).listen('.rt', handlePing);

  const conn = echo.connector?.pusher?.connection;
  if (conn) {
    conn.bind('connected', () => {
      const wasDown = !connected;
      connected = true;
      if (wasDown) emit('resync'); // (re)connected: catch up on anything missed while offline
    });
    conn.bind('disconnected', () => { connected = false; });
    conn.bind('unavailable', () => { connected = false; });
  }

  // phones freeze background sockets: when the tab comes back, reconnect right away and re-sync
  const wake = () => {
    if (document.visibilityState === 'visible' && echo) {
      try { echo.connector?.pusher?.connect(); } catch { /* ignore */ }
      emit('resync');
    }
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);
  echo.__wake = wake;
}

export function stopRealtime() {
  if (!echo) return;
  try {
    document.removeEventListener('visibilitychange', echo.__wake);
    window.removeEventListener('online', echo.__wake);
    echo.leave(`App.Models.User.${currentUid}`);
    echo.disconnect();
  } catch { /* ignore */ }
  echo = null; currentUid = null; connected = false;
}

export const isRealtimeConnected = () => connected;

/** Subscribe to one topic (or '*' for all). Returns the unsubscribe function. */
export function onRealtime(topic, fn) {
  const h = (e) => {
    const d = e.detail || {};
    if (topic === '*' || d.topic === topic || d.topic === 'resync') fn(d.data || {}, d.topic);
  };
  window.addEventListener(RT_EVENT, h);
  return () => window.removeEventListener(RT_EVENT, h);
}
