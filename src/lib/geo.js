/**
 * Location helpers shared by the website and the Android app (Capacitor).
 *
 *  - getPosition()  -> one fix  { lat, lng, accuracy }
 *  - watchLive()    -> keeps calling back with new fixes (used by "Share live location");
 *                      in the APK it runs as an Android foreground service so it keeps working
 *                      when the app is minimised / the screen is off (a notification is shown meanwhile).
 *
 * Errors are GeoError with .code = 'denied' | 'unavailable' | 'timeout' | 'insecure' | 'unsupported'.
 */
import { registerPlugin } from '@capacitor/core';
import { isNative } from '../native';

export class GeoError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'GeoError';
    this.code = code;
  }
}

const HIGH = { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 };
// First, quick fix (network / last known position) so the sheet is never stuck waiting for a cold GPS lock indoors.
const FAST = { enableHighAccuracy: false, timeout: 9000, maximumAge: 120000 };

/** Rejects with GeoError(code) if `p` has not settled in `ms` — a native call that never answers must not freeze the UI. */
function withTimeout(p, ms, code) {
  let t;
  const timer = new Promise((_, reject) => { t = setTimeout(() => reject(new GeoError(code)), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

const fix = (c) => ({
  lat: Number(c.latitude),
  lng: Number(c.longitude),
  accuracy: Number.isFinite(c.accuracy) ? Math.round(c.accuracy) : null,
});

function webError(e) {
  if (e && e.code === 1) return new GeoError('denied');
  if (e && e.code === 3) return new GeoError('timeout');
  return new GeoError('unavailable');
}

function assertWebGeo() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) throw new GeoError('unsupported');
  if (typeof window !== 'undefined' && window.isSecureContext === false) throw new GeoError('insecure');
}

const NativeLinks = isNative ? registerPlugin('NativeLinks') : null;

/** Position from Android's own LocationManager (our NativeLinks plugin). Returns null when this APK has no such method yet. */
async function androidLocation(precise) {
  if (!NativeLinks?.getLocation) return null;
  try {
    const r = await withTimeout(NativeLinks.getLocation({ mode: precise ? 'precise' : 'fast', timeout: precise ? 30000 : 15000 }), precise ? 38000 : 22000, 'timeout');
    return { lat: Number(r.lat), lng: Number(r.lng), accuracy: Number.isFinite(r.accuracy) ? Math.round(r.accuracy) : null };
  } catch (e) {
    const m = String(e?.code || e?.message || e).toLowerCase();
    if (m.includes('denied')) throw new GeoError('denied');
    if (m.includes('gps_off')) throw new GeoError('gps_off');
    if (m.includes('timeout') || e?.code === 'timeout') throw new GeoError('timeout');
    return null; // plugin method missing / failed oddly -> use the Capacitor path below
  }
}

let capGeo = null;
async function capacitorGeo() {
  if (!capGeo) capGeo = (await import('@capacitor/geolocation')).Geolocation;
  return capGeo;
}

/** Asks Android for the location permission (shows the system dialog). Resolves true when granted. */
export async function ensureNativePermission() {
  const G = await capacitorGeo();
  let st = await G.checkPermissions();
  if (st.location !== 'granted' && st.coarseLocation !== 'granted') {
    st = await G.requestPermissions({ permissions: ['location', 'coarseLocation'] });
  }
  return st.location === 'granted' || st.coarseLocation === 'granted';
}

function webPosition(opts) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { reject(new GeoError('unsupported')); return; }
    navigator.geolocation.getCurrentPosition((p) => resolve(fix(p.coords)), (e) => reject(webError(e)), opts);
  });
}

function nativeError(e) {
  if (e instanceof GeoError) return e;
  const msg = String(e?.message || e).toLowerCase();
  if (msg.includes('denied') || msg.includes('permission')) return new GeoError('denied');
  if (msg.includes('timeout')) return new GeoError('timeout');
  return new GeoError('unavailable');
}

/**
 * One position fix.
 *  - precise=false (default): a quick fix first (network / recent position, a few seconds), then a high-accuracy one if that fails.
 *  - precise=true: straight to high accuracy (used to refine the quick fix in the background).
 * In the app every native call has its own deadline and the WebView's own geolocation is the last fallback,
 * so this always settles — with a position or a GeoError — instead of leaving the sheet on "Getting your location…".
 */
export async function getPosition({ precise = false } = {}) {
  if (isNative) {
    // 0) the phone's own location service, straight from Android (works without Google Play Services)
    const direct = await androidLocation(precise);
    if (direct) return direct;
    // 1) permission (system dialog). If the plugin never answers, say so instead of waiting forever.
    let granted;
    try {
      granted = await withTimeout(ensureNativePermission(), 25000, 'stuck');
    } catch (e) {
      if (e?.code === 'stuck') {
        // the permission plugin did not answer: the WebView's geolocation still asks Android for the permission itself
        try { return await webPosition(precise ? HIGH : FAST); } catch { throw new GeoError('stuck'); }
      }
      throw nativeError(e);
    }
    if (!granted) throw new GeoError('denied');

    // 2) position
    const G = await withTimeout(capacitorGeo(), 8000, 'stuck').catch(() => null);
    const attempts = precise ? [[HIGH, 25000]] : [[FAST, 13000], [HIGH, 25000]];
    let lastErr = null;
    if (G) {
      for (const [opts, deadline] of attempts) {
        try {
          const p = await withTimeout(G.getCurrentPosition(opts), deadline, 'timeout');
          return fix(p.coords);
        } catch (e) {
          lastErr = nativeError(e);
          if (lastErr.code === 'denied') throw lastErr;
        }
      }
    }
    // 3) last resort: the WebView's own geolocation
    try { return await webPosition(precise ? HIGH : { ...FAST, timeout: 12000 }); } catch (e) { throw lastErr || e; }
  }
  assertWebGeo();
  return webPosition(precise ? HIGH : { ...FAST, timeout: 12000 }).catch((e) => (e?.code === 'timeout' ? webPosition(HIGH) : Promise.reject(e)));
}

const BackgroundGeolocation = isNative ? registerPlugin('BackgroundGeolocation') : null;

/**
 * Continuous updates. Returns a promise of a `stop()` function.
 * onPos({lat,lng,accuracy}) is called for every new fix, onErr(GeoError) on problems.
 */
export async function watchLive(onPos, onErr, { title = 'Sharing live location', message = 'Your location is being shared in a chat.' } = {}) {
  if (isNative) {
    if (!(await withTimeout(ensureNativePermission(), 25000, 'stuck'))) throw new GeoError('denied');
    // 1) foreground-service watcher (keeps running in the background)
    try {
      const id = await BackgroundGeolocation.addWatcher(
        { backgroundTitle: title, backgroundMessage: message, requestPermissions: true, stale: false, distanceFilter: 5 },
        (loc, err) => {
          if (err) { onErr?.(new GeoError(err.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable')); return; }
          if (loc) onPos(fix(loc));
        },
      );
      return () => { try { BackgroundGeolocation.removeWatcher({ id }); } catch { /* ignore */ } };
    } catch { /* plugin missing in this build -> fall back to the foreground watcher below */ }
    const G = await capacitorGeo();
    const wid = await G.watchPosition(HIGH, (p, err) => {
      if (err) { onErr?.(new GeoError('unavailable')); return; }
      if (p?.coords) onPos(fix(p.coords));
    });
    return () => { try { G.clearWatch({ id: wid }); } catch { /* ignore */ } };
  }
  assertWebGeo();
  const wid = navigator.geolocation.watchPosition(
    (p) => onPos(fix(p.coords)),
    (e) => onErr?.(webError(e)),
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 30000 },
  );
  return () => navigator.geolocation.clearWatch(wid);
}

/** Human message for a GeoError, in the UI language. */
export function geoMessage(err, ar) {
  const t = (en, a) => (ar ? a : en);
  switch (err?.code) {
    case 'denied':
      return isNative
        ? t('Location permission was denied. Enable it from Android Settings > Apps > UIP > Permissions > Location.', 'تم رفض إذن الموقع. فعّله من إعدادات أندرويد > التطبيقات > UIP > الأذونات > الموقع.')
        : t('Location permission was denied. Allow location for this site from the lock icon next to the address bar, then try again.', 'تم رفض إذن الموقع. اسمح بالموقع لهذا الموقع من أيقونة القفل بجانب شريط العنوان ثم حاول مرة أخرى.');
    case 'timeout':
      return t('Could not get your location in time. Make sure GPS is on and try again.', 'تعذّر تحديد موقعك في الوقت المناسب. تأكد من تشغيل الـ GPS وحاول مرة أخرى.');
    case 'gps_off':
      return t('Location is turned off on your phone. Turn it on and try again.', 'خدمة الموقع (GPS) مقفولة على موبايلك. شغّلها وحاول مرة أخرى.');
    case 'stuck':
      return t('The location service did not respond. Make sure Location is turned on and the app has the Location permission (Settings > Apps > UIP > Permissions), then try again.', 'خدمة الموقع لم تستجب. تأكد من تشغيل الموقع (GPS) ومن إعطاء التطبيق إذن الموقع (الإعدادات > التطبيقات > UIP > الأذونات)، ثم حاول مرة أخرى.');
    case 'insecure':
      return t('Location only works on a secure (https) page.', 'الموقع يعمل فقط على صفحة آمنة (https).');
    case 'unsupported':
      return t('This device does not support location.', 'هذا الجهاز لا يدعم الموقع.');
    default:
      return t('Could not get your location. Turn on GPS / location services and try again.', 'تعذّر الحصول على موقعك. شغّل الـ GPS وخدمات الموقع وحاول مرة أخرى.');
  }
}

/* ---- map tiles (OpenStreetMap) used for the in-chat map preview ---- */
export function tileGrid(lat, lng, z) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  return { n, cx, cy, ox: (x - cx) * 256, oy: (y - cy) * 256 };
}

export const mapsUrl = (lat, lng) => `https://www.google.com/maps?q=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}`;
