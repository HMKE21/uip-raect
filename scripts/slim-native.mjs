// Optional: remove the rarely used heavy offline assets from the Android bundle (dist/) to make the APK ~30 MB smaller.
//   SLIM_NATIVE=1 npm run android:sync      -> drops OCR ("Edit text" in the image editor) and the meeting background-blur model.
// Those two features then stop working inside the APK (the website is unaffected). Default: nothing is removed.
import { rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.env.SLIM_NATIVE !== '1') process.exit(0);
const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
for (const d of ['ocr', 'mediapipe']) if (existsSync(join(dist, d))) { rmSync(join(dist, d), { recursive: true, force: true }); console.log('[slim-native] removed dist/' + d); }
