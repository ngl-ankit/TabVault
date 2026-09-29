# TabVault

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/ngl-ankit/TabVault)

TabVault is a privacy-first workspace for saving and organizing browser tabs locally.

The hosted build is a static companion dashboard. Browser tab capture and restore require
the Chrome/Chromium extension runtime; the dashboard itself does not send workspace data
to a server.

## Deploy to Render

Click the **Deploy to Render** button above. Render reads `render.yaml`, installs the
workspace with pnpm, builds only the TabVault frontend, and serves the generated static
files with SPA fallback routing.

### Local development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @workspace/tabvault run dev
```

The Vite config defaults to `PORT=4173` and `BASE_PATH=/`, so no Replit-only
environment variables are required.

## Build

```bash
pnpm run build:render
```

The Render publish directory is `artifacts/tabvault/dist/public`.
