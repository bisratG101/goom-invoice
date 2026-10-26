# Goom Invoice — Notes & Learnings

## Prompt 1: Scaffold Backend and Frontend
- **What was built:** Project skeleton with Node/Express/TypeScript backend and Vite/React 19/Tailwind v4 frontend, including tokens.css `@theme` mapping, Zod environment validation, standard error envelope, and `/health` & `/config` endpoints.
- **One thing learned:** Tailwind v4 maps directly to CSS custom properties via `@theme` without needing a `tailwind.config.js` file, keeping tokens in `tokens.css` as the single source of truth for dark mode swapping.
- **One bug and its cause:** In `frontend/src/lib/api.ts`, TypeScript raised `Property 'env' does not exist on type 'ImportMeta'` because `vite/client` types were not initially included in `frontend/tsconfig.json`.

## Prompt 2: Deploy the Walking Skeleton
- **What was built:** Production deployment configurations (`render.yaml`, `frontend/vercel.json`, and `DEPLOY.md`) covering Neon, Render, and Vercel.
- **One thing learned:** Render omits `devDependencies` in production builds by default, requiring `npm install --include=dev && npm run build` so that `tsc` is available to compile the backend.
- **Common bugs & causes documented in DEPLOY.md:**
  1. CORS Origin mismatch (trailing slashes or http vs https).
  2. Zod environment validation crash on missing/short `JWT_SECRET`.
  3. SPA 404 on refresh on Vercel without `rewrites` to `/index.html`.
  4. Missing `tsc` on Render.
  5. Neon requiring `?sslmode=require`.
