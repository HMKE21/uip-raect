/** Helpers for attendance: a one-shot high-accuracy GPS fix, and a stable per-browser device id. */

export function getPosition(timeout = 15000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(Object.assign(new Error('unsupported'), { code: 'unsupported' })); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(Object.assign(new Error(e.message || 'geo'), { code: e.code === 1 ? 'denied' : 'failed' })),
      { enableHighAccuracy: true, timeout, maximumAge: 0 },
    );
  });
}

export function geoErrorText(err, ar) {
  if (err?.code === 'denied') return ar ? 'تم رفض إذن الموقع. فعّله من إعدادات المتصفح وحاول تاني.' : 'Location permission was denied. Enable it in your browser settings and try again.';
  if (err?.code === 'unsupported') return ar ? 'جهازك لا يدعم تحديد الموقع.' : 'This device does not support location.';
  return ar ? 'تعذّر تحديد موقعك. فعّل GPS وحاول تاني.' : 'Could not get your location. Turn on GPS and try again.';
}

export function deviceId() {
  try {
    let v = localStorage.getItem('uip_device_id');
    if (!v) {
      v = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      localStorage.setItem('uip_device_id', v);
    }
    return v;
  } catch { return ''; }
}
