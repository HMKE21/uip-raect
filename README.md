# React-full — Ultimate Intelligent Platform (UIP)

React 19 + Vite 8 single-page app for UIP (student, university, faculty, admin,
supervisor, security and data-analysis portals, plus the public pages).
It talks to a Laravel API through relative URLs (`/api/...`, `/uploads/...`).

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173  (proxies /api and /uploads to the backend)
```

Production build check:

```bash
npm run build
npm run preview    # http://localhost:4173  (same proxy)
```

Requires Node 20.19+ (22 recommended, see `.nvmrc`).

## Deploy

The repo is ready for static hosting — the backend proxy and the SPA fallback
(so refreshing `/projects/abc` works) are already configured.

- **Vercel:** import the repo, no settings to change (`vercel.json`).
- **Netlify:** import the repo, no settings to change (`netlify.toml`).
- Any other host: serve `dist/`, rewrite unknown paths to `/index.html`, and
  proxy `/api/*` and `/uploads/*` to the backend.

The backend URL lives in `vercel.json`, `netlify.toml` and `vite.config.js`
(default `https://uip-laravel-production.up.railway.app`) — change it in
those three places if the API moves.

## Environment variables

Optional, see `.env.example`. Everything works out of the box.

## Structure

```
src/pages        route pages per portal
src/components   shared UI
src/styles/css   design system (landing.css = public pages)
src/i18n         AR/EN dictionaries
src/api          API client (Bearer JWT, auto refresh)
docs/            older change notes and project structure
```
