# OSKA on Vercel — browser-only release boundary

## Current deployed environment

The cloud foundation is deployed at **https://oska-agent.vercel.app** in the owner's Vercel account. A new Neon `free_v3` database resource named `oska-agent-db` was provisioned in Singapore and connected only to this project. The committed cloud SQL schema was applied successfully. A live database smoke test verified persistence, cross-user list isolation, cross-user deletion rejection and blocked-provider goal persistence; its synthetic records were removed afterwards.

`APP_ORIGIN` and a generated sensitive `AUTH_SECRET` are configured for production. An OSKA-owned Google OAuth client is not configured. Managed Google **preview identity is enabled** using Neon shared testing credentials; it may display Neon branding. The hosted subscription inference restrictions below still apply. Deployment is not equivalent to completing those integrations.

Managed identity preview uses the official `@neondatabase/auth/next` SDK. The operator authorized Neon CLI access to the existing Vercel organization and `oska-agent-db` project. The exact production origin `https://oska-agent.vercel.app` was added to the existing branch's trusted domains. A real social sign-in request then returned 200 and its redirect returned 302 to `accounts.google.com`. Production `OSKA_AUTH_MODE=neon-preview` is enabled. The integration supplies `NEON_AUTH_BASE_URL`; `AUTH_SECRET` signs SDK cookies. The SDK consumes its one-time verifier at `/auth/complete`. Shared Neon Google credentials are for development/testing and may show Neon branding; use your own OAuth client before a public production launch. User Google consent and a complete authenticated workspace session still require the user to sign in on the website; the operator's Neon management authorization does not sign users into OSKA.

In preview mode, cloud APIs revalidate the managed session upstream, require verified email and derive workspace ownership from the managed subject (`neon:` prefix). Sign-out uses the SDK to revoke its session. Google client mode continues to use OSKA's encrypted, revocable database sessions. Both modes are identity only; neither enables model quota access.

The Vercel project is linked to the GitHub repository for future deployments. No CLI credentials, local artifacts or SQLite database were uploaded. The deploy dry run verified those exclusions.

This is a separate hosted workspace mode. The working local CLI edition is preserved. Vercel always activates cloud mode, even if someone sets OSKA_MODE=local. The hosted app rejects every legacy local-execution route before loading the local handler.

## What this version can and cannot do

The separate [agent-host package](../agent-host/README.md) adds a persistent server path with one isolated native-provider worker per verified user. The browser communicates through the authenticated `/api/cloud/agent/*` bridge; users need no companion. Hosting is not provisioned/connected yet. `OSKA_AGENT_ORIGIN` and `OSKA_AGENT_SECRET` must be configured only after validating that host. Its Connections UI offers native login, catalog discovery, text tasks and sequential saved-team roles; browser/computer tools are not implemented there. Legacy saved-goal records continue to be blocked drafts; server execution jobs are persisted separately in the worker volume. The original Vercel-only restrictions below remain applicable without this host. Native client installation is not proof of permission for a public subscription service.

After deployment configuration, users can sign in with Google, save personal goals, create/delete team drafts, and assign requested provider/model identifiers to roles. Every query is scoped to the Google-verified subject. Model identifiers in drafts are explicitly unverified; no fictional catalog is shown.

**This does not implement hosted inference from Antigravity, ChatGPT or Codex subscriptions.** Goals are recorded as BLOCKED_PROVIDER and no model request is sent. Team drafts do not run agents. Do not advertise this branch as a complete Manus-like cloud agent.

The previously verified local `agy` flow still works only on the user's own computer. A hosted Vercel function cannot use each visitor's local CLI session. No local credential file is uploaded or shared, and the owner's account is never used for visitors.

Current official OpenAI plan-usage documentation describes open-source/locally hosted applications and directs paid/remotely hosted apps to its provider interest process. Browser-only hosted plan usage therefore needs the provider-supported approval/integration path before implementing production consent, token custody and inference. Identity-only Sign in with ChatGPT is not proof of plan usage permission. Codex is a harness, not a way around account entitlement.

References:

- [OpenAI plan-usage scope and hosted-app interest process](https://developers.openai.com/siwc/token-sharing-open-source)
- [Codex app-server integration](https://developers.openai.com/siwc/token-sharing-open-source/codex-app-server)
- [Antigravity official headless interface](https://antigravity.google/docs/cli/headless/)
- [Vercel Postgres integrations](https://vercel.com/docs/postgres)

## Deploy to your Vercel account

1. Import this GitHub repository into Vercel as a Next.js project, with the repository root as Root Directory. `vercel.json` selects pnpm, the build command and cloud mode. Do not upload a local `.env`, SQLite database, `data/` or CLI credentials. `.vercelignore` excludes them from CLI uploads; Git ignores private runtime files too.
2. Connect your own durable Postgres database through Vercel Storage/Marketplace. Review the provider's plan and limits yourself; no paid resource is provisioned by OSKA. Configure `CLOUD_DATABASE_URL` with its connection string. OSKA does not use SQLite in cloud mode.
3. Create a Google OAuth **Web application** client for website identity. Configure consent/audience and testing users as required. Register `https://YOUR-PROJECT.vercel.app/api/cloud/auth/callback` exactly.
4. Set the runtime variables in Vercel:

   ```dotenv
   OSKA_MODE=cloud
   APP_ORIGIN=https://YOUR-PROJECT.vercel.app
   GOOGLE_CLIENT_ID=your-web-client.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-secret
   AUTH_SECRET=at-least-32-random-characters
   CLOUD_DATABASE_URL=postgresql://...
   ```

   Generate AUTH_SECRET locally with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Keep it private. APP_ORIGIN must be the exact production origin, without a trailing slash. Preview deployments need their own correctly configured origin and OAuth callback; do not weaken host validation for arbitrary preview URLs.
5. Apply `cloud/migrations/001_initial.sql` to that database before enabling sign-in. You can run it in your provider's SQL console or execute `pnpm cloud:db` with CLOUD_DATABASE_URL supplied through your trusted environment. The script does not provision a database. It creates only the prefixed cloud tables and indexes and preserves existing data.
6. Redeploy. Sign in on Google and return to OSKA. Confirm two test accounts cannot see each other's teams/goals. Sign out revokes the current server-side session.

The cloud build does not require database credentials, so an operator can build first. Sign-in stays disabled until the required runtime configuration is present. A deployment is not verified merely because compilation succeeds.

## Security and persistence

- Website identity is verified through Google's official library using authorization code, PKCE, state, nonce and token signature/audience/issuer/expiry validation.
- OAuth flow data is held in an encrypted HttpOnly, SameSite=Lax cookie instead of a server-process map, so it works across Vercel function instances. Session cookies are encrypted, expire after eight hours, and reference an active revocable Postgres session. Google model/access/refresh tokens are not stored.
- API routes require exact deployment host/origin and verify the session server-side. Team reads, inserts and deletes, goal reads/inserts, and session checks carry the verified owner ID. Cross-user IDs return not-found. No client-supplied owner ID is accepted.
- Postgres enforces a per-user limit of 60 write attempts per minute across function instances. JSON size limits and Zod bounds reject malformed or excessive inputs.
- User-created content renders as text. No raw HTML, arbitrary command, local file operation, or client-supplied inference endpoint is executed.
- Provider-specific consent, encrypted model-token custody, token renewal, model catalogs, entitlement verification and real team orchestration are still required after official cloud eligibility is established. Do not flip an environment flag and claim these features exist.

## Validation and honest limits

```powershell
pnpm test
pnpm typecheck
# Separate production output so the running local dev app is not overwritten:
$env:OSKA_BUILD_CHECK='1'
$env:OSKA_MODE='cloud'
pnpm build
```

Cloud Playwright tests expect the cloud production preview at `http://127.0.0.1:3001`; run `next start` with the same build-check/cloud variables and APP_ORIGIN set to that origin, then `pnpm exec playwright test -c cloud/playwright.config.ts`.

Production-mode API tests cover rejection of legacy CLI routes, missing/forged sessions and cross-origin writes. UI tests explicitly mock signed identity/DB responses; they do not prove live Google consent or real Postgres persistence. Those must be tested with your actual configured Vercel deployment. A local production preview is not a deployed Vercel URL.

The managed-preview change passed 61 unit tests, the production build, and all nine local browser tests. Four cloud browser checks passed against the deployed production origin (three initially, the preview-login fixture after narrowing its alert locator to exclude Next's route announcer). Those checks cover the disabled auth boundary and mocked team/login UI, not live Google consent. Run them with `OSKA_CLOUD_TEST_ORIGIN=https://oska-agent.vercel.app`; use `OSKA_BROWSER_CHANNEL=chrome` if the Playwright browser download is unavailable. The local port-3001 test server launch was rejected by automatic approval review, so deployed checks were used instead.
