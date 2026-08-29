# Project-Scoped Rules

## Auto GitHub Commit, Push, and Deploy
- Whenever code changes or bug fixes are completed and verified:
  1. Build the production application (`npm run build`).
  2. Commit and push changes to GitHub (`git add .`, `git commit -m "...", git push origin main`).
  3. Deploy the application (`npm run deploy` / `npx wrangler deploy`).
