# Goom Invoice — Deployment Guide

This guide details the step-by-step instructions to deploy the Goom Invoice walking skeleton to production using **Neon** (PostgreSQL database), **Render** (Node.js API), and **Vercel** (React SPA web frontend).

> **Important Rule:** Never commit secrets to code or Git. All production secrets must be set directly in provider management dashboards. Do not hardcode live URLs in configuration files.

---

## 1. Overview of Deployment Architecture

- **Database:** PostgreSQL on Neon (cloud serverless Postgres, single `public` schema, SSL enforced).
- **Backend API:** Node.js + Express web service hosted on Render (free tier, root directory `backend`, health check at `/health`).
- **Frontend Web:** Vite + React 19 Single Page Application hosted on Vercel (free tier, root directory `frontend`).

---

## 2. Step-by-Step Deployment Procedure

### Step 1: Provision Production Database on Neon

1. Log in to [Neon Console](https://console.neon.tech).
2. Create a new project:
   - **Name:** `goom-invoice-prod`
   - **Region:** Select the region closest to your target users or API service (e.g., `eu-central-1` or `us-east-1`).
   - **PostgreSQL Version:** 16 or 17.
3. Once the database is ready, copy the **Connection string**. It will look like:
   ```
   postgresql://<username>:<password>@<neon-hostname>/<dbname>?sslmode=require
   ```
4. Note this `DATABASE_URL` for Step 2. Keep the password confidential.
   *(Note: Database migrations will be applied starting in Prompt 3; for Prompt 2, `/health` works whether or not `DATABASE_URL` is configured).*

---

### Step 2: Deploy Backend API on Render

You can deploy using either the Blueprint (`render.yaml`) or a Manual Web Service.

#### Option A: Deploy via Blueprint (Recommended)
1. Push your repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** &rarr; **Blueprint**.
3. Connect your repository. Render will automatically detect `render.yaml`.
4. Render will prompt you for the uncommitted environment variables marked `sync: false`.

#### Option B: Deploy Manually
1. Click **New +** &rarr; **Web Service**.
2. Connect your GitHub repository.
3. Configure the service settings:
   - **Name:** `goom-invoice-api` (or your chosen service name)
   - **Region:** Match your Neon database region (e.g., Frankfurt or Oregon)
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install --include=dev && npm run build`
   - **Start Command:** `npm run start`
   - **Health Check Path:** `/health`
4. Under **Environment Variables**, add the following keys:

| Key | Value / Instructions |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `10000` (Render defaults to 10000) |
| `DATABASE_URL` | Neon connection string with `?sslmode=require` |
| `JWT_SECRET` | Generate 32+ random characters (e.g., `openssl rand -hex 24`) |
| `JWT_EXPIRES_IN` | `1h` |
| `CORS_ORIGIN` | Temporary placeholder (e.g., `https://localhost:5173`); will be updated in Step 4 with the exact Vercel URL |
| `APP_BASE_URL` | Temporary placeholder; will be updated in Step 4 with the exact Vercel URL |
| `API_BASE_URL` | `https://<your-render-service>.onrender.com` (no trailing slash) |
| `PAYMENT_PROVIDERS` | `chapa,simulated` |
| `CHAPA_SECRET_KEY` | Placeholder or Chapa test key |
| `CHAPA_WEBHOOK_SECRET` | Placeholder or Chapa webhook secret |
| `DEMO_MODE` | `true` |
| `SIMULATED_WEBHOOK_SECRET` | Generate random secret |
| `LLM_API_KEY` | (Optional, leave blank for V1) |

5. Click **Create Web Service**.
6. Wait for the deploy to complete. When healthy, Render will display a green badge and report `/health` as passing.
7. Copy your public Render API URL: `https://<service-name>.onrender.com` (no trailing slash).

---

### Step 3: Deploy Frontend Web on Vercel

1. Log in to [Vercel](https://vercel.com).
2. Click **Add New...** &rarr; **Project**.
3. Import your GitHub repository.
4. Configure Project Settings:
   - **Framework Preset:** Vite
   - **Root Directory:** Click Edit and select `frontend` (do not leave as repository root)
   - **Build Command:** `npm run build` (or `vite build`)
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
5. Under **Environment Variables**, configure:

| Key | Value | Notes |
|---|---|---|
| `VITE_API_URL` | `https://<service-name>.onrender.com/api/v1` | **No trailing slash**. Must include `/api/v1`. |
| `VITE_APP_NAME` | `Goom Invoice` | Product display name |

> [!IMPORTANT]
> **Vite Environment Variables are baked in at build time:**
> In Vite, all `VITE_*` environment variables are statically embedded into the JavaScript bundle during compilation. If you change or update `VITE_API_URL` in the Vercel dashboard later, you **MUST trigger a Redeploy** (Deployments &rarr; Redeploy) for the changes to take effect in the browser.

6. Click **Deploy**.
7. Once deployment finishes, Vercel will provide your production domain:
   `https://<project-name>.vercel.app` (no trailing slash).

---

### Step 4: Link Frontend and Backend (CORS & Base URLs)

Now that both domains exist, link them together to enable CORS and callback generation:

1. Open your **Render Dashboard** &rarr; Select `goom-invoice-api` &rarr; **Environment**.
2. Update:
   - `CORS_ORIGIN` &rarr; `https://<project-name>.vercel.app` (exact origin, `https://`, **no trailing slash**).
   - `APP_BASE_URL` &rarr; `https://<project-name>.vercel.app` (exact origin, `https://`, **no trailing slash**).
3. Save changes. Render will automatically redeploy the web service with the updated environment variables.

---

### Step 5: Verification Checklist

1. Open `https://<project-name>.vercel.app` in your browser.
2. Confirm the Goom Invoice placeholder page loads cleanly without stylesheet or script errors.
3. Click **"Check API Health →"** or navigate directly to `https://<project-name>.vercel.app/health`.
4. Confirm:
   - The UI shows `API SERVER: OK`.
   - The UI displays the real response from the Render API (`status: ok`, `database: not_configured` or `connected`).
   - Browser DevTools &rarr; Network shows a successful cross-origin `200 OK` request to `https://<service-name>.onrender.com/health` (or `/api/v1/health`).
   - Browser DevTools &rarr; Console shows **zero** CORS errors and zero failed network requests.
5. Refresh the page while on `/health` &rarr; Confirm it loads without a 404 error (verifying `vercel.json` SPA rewrite).

---

## 3. Troubleshooting: Common Deployment Pitfalls & Exact Fixes

### Bug 1: CORS Errors in Browser Console
- **Symptom:** Browser blocks the request with: `Access to fetch at ... from origin ... has been blocked by CORS policy`.
- **Causes:**
  1. `CORS_ORIGIN` in Render does not match the exact browser origin.
  2. Trailing slash in `CORS_ORIGIN` (e.g., `https://goom.vercel.app/` instead of `https://goom.vercel.app`).
  3. Protocol mismatch (`http://` instead of `https://`).
  4. Vercel deployment preview URL used instead of the configured production domain.
- **Fix:**
  - In Render, ensure `CORS_ORIGIN` is exactly `https://<your-app>.vercel.app` with no trailing slash and no whitespace.
  - Check Network tab &rarr; Request Headers &rarr; `Origin` to confirm the exact origin sent by the browser.

---

### Bug 2: Missing or Malformed Environment Variables (Zod Boot Failure)
- **Symptom:** Render deployment fails during startup or enters a crash loop with: `Environment validation failed. Server cannot boot`.
- **Causes:**
  1. `JWT_SECRET` is shorter than 32 characters.
  2. `APP_BASE_URL` or `API_BASE_URL` is not a valid URL (e.g. missing `https://`).
  3. Quotation marks were included in the Render dashboard value (e.g. `"true"` or `'https://...'` instead of plain text).
- **Fix:**
  - Inspect Render service logs. Zod will print the exact failing keys:
    ```
    Environment validation failed. Server cannot boot:
      - JWT_SECRET: JWT_SECRET must be at least 32 characters
    ```
  - Generate a secure 32+ character key:
    ```bash
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    ```
  - Enter raw values in the Render dashboard without quotes.

---

### Bug 3: SPA 404 on Refresh (Deep Link Routing)
- **Symptom:** Visiting `https://<project-name>.vercel.app/` works, but refreshing while on `/health` returns a generic 404: `NOT_FOUND`.
- **Cause:** Vercel looks for a static file named `/health.html` on the server instead of delegating routing to the React SPA router (`index.html`).
- **Fix:**
  - Verify `frontend/vercel.json` is present and committed with the rewrite rule:
    ```json
    {
      "rewrites": [
        { "source": "/(.*)", "destination": "/index.html" }
      ]
    }
    ```
  - Verify that the Root Directory in Vercel project settings is set to `frontend`.

---

### Bug 4: `tsc: not found` on Render Build
- **Symptom:** Render build fails with: `sh: 1: tsc: not found` or `Command failed with exit code 127`.
- **Cause:** When `NODE_ENV=production` is set, npm by default omits `devDependencies` during `npm install`. Since `typescript` is in `devDependencies`, `tsc` is not installed into `node_modules/.bin`.
- **Fix:**
  - Use the build command specified in `render.yaml` and design.md §13:
    ```bash
    npm install --include=dev && npm run build
    ```
  - This guarantees TypeScript and all compilation tools are installed during the build step.

---

### Bug 5: Database Connection & SSL Failures on Neon
- **Symptom:** Backend logs show: `error: no pg_hba.conf entry for host ... no encryption` or `self-signed certificate in certificate chain`.
- **Cause:** Neon serverless PostgreSQL strictly requires SSL encrypted connections (`sslmode=require`).
- **Fix:**
  - Ensure the connection string ends with `?sslmode=require`.
  - In `backend/src/db/pool.ts`, the connection pool is configured to support SSL in production:
    ```ts
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
    ```

---

### Bug 6: Render Free Tier Cold Starts
- **Symptom:** The first request to `/health` takes 30–50 seconds to respond after being idle.
- **Cause:** Render free tier instances spin down to 0 after 15 minutes of inactivity. The first incoming request initiates a cold start.
- **Fix:**
  - This is expected behavior on the free tier. Wait up to 50 seconds for the service to wake up.
  - The frontend design includes a slow backend indicator (design.md §12.9) that alerts the user after 4 seconds: `"Waking up the server, this can take up to 30 seconds."`
