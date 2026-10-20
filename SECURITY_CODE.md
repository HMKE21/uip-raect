# Certificate security code (server side)

The certificate page prints `graduation.security_code` (under the certificate number) and adds it to the
QR link as `&code=...`. The frontend only displays it; the secret key must stay on the server.

## Issue time (when the certificate is approved)
```js
const crypto = require('crypto');
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L

function securityCode({ number, fullName, graduationDate }) {
  const mac = crypto.createHmac('sha256', process.env.CERT_SECRET)          // long random secret, never in git
    .update([number, fullName.trim().toLowerCase(), graduationDate].join('|'))
    .digest();
  let out = '';
  for (let i = 0; i < 10; i += 1) out += ALPHABET[mac[i] % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;                              // e.g. K7QM2-9XH4D
}
```
Return it as `security_code` in the certificate API response (or compute it on the fly).

## Verify time (`/verify-certificate?number=...&code=...`)
Recompute with the stored record, compare with `crypto.timingSafeEqual`, and show the holder's name,
degree and dates only when the code matches. Treat a wrong or missing code as "not verified",
and rate-limit the endpoint so codes cannot be guessed.

## Optional signer fields
`signatory_name_en/ar` and `signatory_title_en/ar` on the graduation record are printed under the right-hand line.
