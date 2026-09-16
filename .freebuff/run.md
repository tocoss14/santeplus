# Run Doc — SantéPlus Frontend Preview

## How to reproduce artifacts

No build step needed — Vite dev server runs directly from source.

Copy `.env` files: None required (API proxy targets localhost:4000 by default).

Install dependencies:
```
cd apps/web
npm install
```

## How to run the server

```bash
cd apps/web
npm run dev
```

- Port: 5173 (default Vite)
- API proxy: `/api` → `http://localhost:4000`
- Note: API backend is NOT running, so data-dependent pages show loading/error states. Static UI (landing, login, register, provider registration) renders fully.

## Preview notes

- URL: `http://localhost:5173`
- The preview shows the frontend shell, navigation, menus, and page layouts.
- Pages requiring live API data (dashboard, claims, subscriptions) will show empty states or error banners — this is expected without the backend.
