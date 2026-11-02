# Deploy to Netlify

1. Put these files in the repo root (same paths): `netlify.toml`, `netlify/edge-functions/api-proxy.js`. Commit + push.
2. Netlify -> Add new site -> Import an existing project -> GitHub -> HMKE21/uip-raect.
   Build command `npm run build`, publish directory `dist` (both are read from netlify.toml). Deploy.
3. Site configuration -> Environment variables:
   - `UIP_PROXY_SECRET` = same value as on Railway (keeps the visitor's real IP; see api-proxy.js). Redeploy after adding it.
4. After the first deploy, with the new address (https://<name>.netlify.app):
   - Laravel / admin "Platform policy": FRONTEND_URL and "Allowed websites (CORS)" -> add the Netlify address.
   - Google sign-in: add it to Authorized JavaScript origins. Microsoft sign-in: add `https://<name>.netlify.app/ms-auth.html` as a redirect URI.
   - If you use a custom domain, point it at Netlify and use that address everywhere instead.
5. Test: log in, send a message, upload a photo and a video, open a chat and a PDF.
