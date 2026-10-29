# OSKA AGENT

**Your intelligent autonomous workspace. Think. Plan. Execute.**

A working local-first MVP for Windows. Next.js / React / strict TypeScript, Tailwind, a shadcn-style Radix Button, Lucide and Framer Motion. Prisma 6 + SQLite persist tasks, plans, approvals, conversations, events, artifacts and usage. Real events stream over SSE. No paid API connector is enabled.

## Install and start (PowerShell)

Prerequisites: Windows 10/11, Node.js 22.12+ (tested on Node 24), and pnpm 10. Chromium is needed only for Browser/Research tasks. Antigravity CLI is needed only for model tasks.

```powershell
cd 'E:\OSKA AGENT'
npm install --global pnpm@10.20.0
pnpm install
pnpm setup
pnpm exec playwright install chromium
pnpm dev
```

Open **http://127.0.0.1:3000**. The server binds only to loopback. Setup copies `.env.example` if `.env` is missing, generates Prisma Client, and applies committed migrations. It normalizes relative SQLite URLs to an absolute path when initializing on Windows. No credit card or Google OAuth client ID is required.

If you prefer not to install pnpm globally, replace `pnpm` with `npx --yes pnpm@10.20.0` in these commands.

Production build on this computer:

```powershell
pnpm build
pnpm start
# In another PowerShell window:
pnpm health
```

සිංහල: මුලින් Node.js ස්ථාපනය කරන්න. ඉහත විධාන PowerShell තුළ ධාවනය කර http://127.0.0.1:3000 විවෘත කරන්න. Google AI සඳහා `agy` තුළ නිල Google පිවිසුම සම්පූර්ණ කරන්න. ගෙවීම් සහිත අමතර credits සක්‍රිය නොකරන්න.

## Connect your existing Google account

OSKA web identity and model authorization are separate. This single-user local version needs no OSKA login. A Google website login does not grant model inference access.

**Already signed into `agy`? Open OSKA and use it directly.** It detects the existing official account session and loads `agy models`. Connections shows **Your AI is ready in OSKA → Open Agent Workspace**. Choose a model, enter your task, create its plan and approve execution. You do not need Google OAuth Client IDs, API keys, another account, or another CLI conversation. Read and run tasks in the web workspace.

With native CLI versions exposing `--settings` (verified with installed 1.4.10), OSKA sets `useG1Credits=false` and denies CLI tools for each invocation using session-only settings. Your normal interactive CLI settings are preserved. Older CLI versions still require the reviewed global safeguard configuration. An alternate API `modelProvider` is always rejected. Google website identity is optional under **Settings → Optional Google website profile**; it is not required for AI tasks.

The live checks `scripts/smoke-cli.ts` and `scripts/smoke-web.mjs` can verify the existing account. Both are opt-in; the web check creates a real approved task, waits for real output, and downloads its two artifacts. No mock provider response is used. To explicitly approve the web check: `$env:OSKA_WEB_SMOKE='1'; node scripts/smoke-web.mjs`.

### Google website account: Google → OSKA profile

Settings has an optional **Sign in to OSKA with Google → Continue with Google** button. This is real Google OpenID Connect for the website, not the CLI launcher. Google redirects back to OSKA automatically; the verified name and email appear in the sidebar and account card. It needs a one-time OAuth Web application registration owned by you:

1. Open [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients), configure the consent screen/audience, and create a **Web application** OAuth client. If the app is in testing, add your Google account as a test user.
2. Register the exact authorized redirect URI: `http://127.0.0.1:3000/api/auth/google/callback`. If using `http://localhost:3000`, also register `http://localhost:3000/api/auth/google/callback`; these hosts are distinct for OAuth and cookies.
3. Put the credentials in the ignored local `.env`, never in chat or source control:

   ```dotenv
   GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your-client-secret"
   ```

4. Restart OSKA. Click **Continue with Google**, select the account on Google's site, and consent to identity scopes. You return directly to your OSKA workspace. No terminal is launched by this website-login button.

This does not activate paid AI APIs or provide model entitlement. The separate **Connect Google AI via CLI** action below still handles model authorization. Without OAuth configuration, OSKA displays setup instructions instead of claiming a connected web account. Existing CLI credentials cannot be converted into a website identity session, and no credential files are inspected for an account email.

Website login uses Google's official `google-auth-library`, authorization-code exchange, PKCE, browser-bound one-time state, nonce, and server verification of the signed ID token including audience/issuer/expiry. Only the verified subject/name/email and a hashed opaque session ID are stored locally. Google access/refresh/ID tokens are not persisted or exposed to the frontend. The HttpOnly, SameSite=Lax session lasts seven days and can be revoked with **Sign out of OSKA**. Callback query strings are excluded from Next.js development request logging.

Website identity remains optional in this single-user local release: it personalizes the local workspace, and does not partition existing tasks between Google accounts or turn the app into an authenticated cloud service.

### Google AI model authorization

**Recommended Windows flow: open Connections in OSKA.**

The separate **Connect Google AI via CLI** button chooses the correct model-authorization path automatically: if agy is missing, it offers installation followed by official CLI sign-in in the same terminal; if installed, it opens official sign-in directly. Review and approve that scope once. Windows is explicitly asked to create a normal visible window; launch errors are reported and there is no stale ten-second retry lockout. The browser cannot obtain model authorization with an ordinary Google website login alone.

1. Click **Install CLI**. OSKA fetches Google's official PowerShell installer at the fixed HTTPS URL and displays its source, contents and SHA-256. Review and approve the specific action to open a visible local PowerShell installer. The exact reviewed snapshot is executed, not a newly fetched script. Windows policies are not bypassed, and administrator elevation is not requested. Complete installation in that window.
2. Click **Check installation**. OSKA detects `%LOCALAPPDATA%\agy\bin\agy.exe` as well as PATH, so a newly installed CLI can be found without restarting the server.
3. Click **Sign in with Google**, review the action and approve opening official agy in a visible terminal. Complete Google's browser sign-in there. OSKA does not capture terminal output, OAuth codes, passwords or credentials. Opening the terminal is not an authenticated badge.
4. Click **Enable safeguards**, review the global settings changes and approve. OSKA backs up existing CLI settings and merges the same restrictions described below. It refuses an alternate API provider configuration and preserves unrelated settings.
5. Set Google account **AI Credit Overages to Never**, then **Refresh models**. Confirm your overage settings in the setup panel and click **Prepare a real connection test**. Submit its task plan and approve execution to consume a real request from your plan quota. A successful request, not a model catalog entry, verifies access.

Web setup approvals expire after five minutes, can be used once, and are bound to one allowlisted action. The local server rejects arbitrary command/script fields. Installer or login windows remain under your control; close them yourself after completion. If a terminal cannot be opened, expand **Prefer manual setup?** for copyable official commands. Downloaded installer snapshots stay in `data/connection/`; no credential files are written there. Web setup is Windows-only.

Manual alternative:

1. Install the **official native Antigravity CLI** from [Google's installation documentation](https://antigravity.google/docs/). Do not install an unofficial account proxy.
2. Open your own PowerShell and run `agy`. Complete the official browser sign-in for your personal Google account. The CLI uses its own official secure credential mechanism. Never upload credential files to OSKA.
3. In Google account plan settings, set **AI Credit Overages to Never**. See [official plans](https://antigravity.google/docs/plans/).
4. Review `scripts/configure-antigravity.ps1`, then run it yourself:

   ```powershell
   .\scripts\configure-antigravity.ps1
   ```

   This edits the official `~/.gemini/antigravity-cli/settings.json`. It creates a timestamped backup, preserves unrelated settings, sets `useG1Credits=false`, selects strict tool permissions, and adds deny rules for CLI file, command, browser and MCP tools. **These restrictions also affect your normal interactive agy sessions.** Restore the backup when you want your previous interactive behavior; OSKA will then block inference until its safeguards are restored. The script refuses an alternate `modelProvider` configuration. It does not read or copy tokens.
5. Restart OSKA if PATH changed. Open **Connections → Check connection → Refresh real models**. OSKA safely spawns `agy.exe --version` and `agy.exe models` with `shell:false`. If needed, set `AGY_EXECUTABLE` to the official native executable's absolute path in `.env`. Windows `.cmd`/`.ps1` wrappers are deliberately unsupported.
6. Choose a discovered model in the composer, enter a prompt in Chat or Code mode, then create the plan. Review the scope and click **Approve & run**.

Catalog discovery is not proof of account entitlement. OSKA marks authorization as unverified until a real model request succeeds. There is no invented `auth status` command or OAuth callback. Real inference runs `agy -p <prompt> --output-format stream-json --model <validated-id>` with documented plan, slash-command disabling, sandbox and timeout flags. The adapter parses actual `init`, `step_update` and `result` envelopes, records reported usage and preserves the official conversation ID for retries. Built-in CLI tools remain denied; OSKA runs its own narrow tools.

Official references: [headless protocol](https://antigravity.google/docs/cli/headless/), [CLI flags and settings](https://antigravity.google/docs/cli/reference/), [authentication](https://antigravity.google/docs/install/), [credit controls](https://antigravity.google/docs/cli/credits/), [permissions](https://antigravity.google/docs/permissions/). The adapter is implemented against these documents; live inference requires installation and your own authenticated account.

## Try a task without a model

**Files:** choose Files in the prompt composer and enter your own document text. Create the plan, approve it, then open the task's **Files** tab. Download its real Markdown and PDF exports. Unicode is preserved in Markdown; the basic PDF font replaces unsupported characters with `?`.

**Browser:** choose Browser and enter `Read https://example.com and save a screenshot and source text.` Approve the exact URL. Isolated Chromium reads the approved origin, captures a screenshot, and saves page text with its source URL plus Markdown/PDF. Research mode follows this same single-source capture path and explicitly labels results as source captures, not AI summaries. It does not pretend to run a search engine.

Attach supports plain text/code files up to 24 KB. Their text is appended to the prompt; it is sent to Google only if you approve a model task. Binary documents and persistent source-file uploads are not supported yet.

## Quota and cost limitations

- No paid API keys, paid search, cloud databases or automatic model fallback.
- Before each inference, OSKA rechecks `useG1Credits=false` and its restrictive permission configuration. Inherited API-key and alternate billing environment variables are stripped from spawned processes.
- Quota errors stop the task and display an actionable error. Retry requires a fresh approval. OSKA never buys credits or silently switches provider/model.
- Remaining quota is **unknown** unless exposed by a supported mechanism. Inspect `/usage` in official agy; OSKA reports only tokens/status actually returned by requests.
- Existing subscription costs and settings outside OSKA remain your responsibility. OSKA cannot override provider billing behavior or guarantee charges imposed outside its control.

## What works, and what remains

Implemented: responsive light/dark workspace, guided setup, real dynamic CLI catalog adapter and streaming adapter, persistent lifecycle, fixed reviewable plans, approvals, single-process concurrency limit, duplicate request IDs, cancellation, safe retry, stopped-process pause, source captures, Markdown/PDF exports, history search/filter/pagination, usage, file downloads, task record deletion, and local privacy settings.

Plans are explicit **deterministic OSKA execution plans**, not fabricated AI reasoning. Files mode exports supplied text; Code mode produces model output without executing generated commands. Pause terminates the active process. Resume prepares a retry requiring approval; it does not freeze a Windows process. A retry may regenerate output or repeat a read-only capture, and cannot promise exact conversation continuation after interrupted requests.

Not implemented: arbitrary autonomous tool selection, interactive browser click/type/form submission, multi-page search, persistent browser sessions, binary document extraction, code execution sandbox/diffs, multi-turn chat composer, Codex app-server, Ollama, Manus API, multi-agent delegation, automations, multi-user Google web login, encryption at rest, automatic retention and cloud companion pairing. Unsupported integrations are visibly unavailable. No demo connector or mock response is enabled.

This is a functional local MVP, not a completed cloud security product. Do not publish its execution routes or put it behind a public tunnel. Cloud deployment is intentionally not enabled.

## Security boundaries

- All API routes check loopback host/port. Writes require the exact same-origin `Origin` header; cross-site requests are rejected. Read/write limits constrain request volume. Zod validates request contracts.
- No model-generated command is executed. CLI receives executable and argument arrays, never shell strings. Account settings must deny all CLI tools. No permission bypass flag is used.
- Browser runs an isolated context with JavaScript, service workers and downloads disabled. DNS is checked, a public IPv4 is pinned at Chromium resolution, unrelated hosts are denied, every request is restricted to the approved origin and GET, and session resources close in `finally`. Redirects to other origins and private networks are blocked. This intentionally limits some websites. It is not a substitute for an OS network sandbox against a compromised browser.
- Task files use generated paths under `data/tasks`; traversal and symlinks are rejected. Output files are created exclusively, with no overwrite. Files are downloaded as attachments. Model text is rendered as text, not HTML.
- Local database content is plaintext. Use Windows account/file permissions and disk encryption for sensitive work. OSKA does not log CLI stderr or raw credential configuration. Prompts/results may contain private content you supply.
- One server instance per database is supported. Interrupted in-flight tasks become failed on restart and never restart themselves. Do not run multiple servers against the same SQLite file.

Deleting a task removes its database relations, including conversation, events and artifact records. Artifact bytes remain in `data/tasks/<task-id>` until you delete that directory manually with the server stopped. There is no automatic cleanup timer yet. Back up `prisma/oska.db` and `data/tasks` together if you want to preserve output.

## Architecture and repository

```text
src/
  app/
    api/[...path]/route.ts   validated local API + SSE
    globals.css             responsive premium design system
    layout.tsx, page.tsx     Next.js App Router entry
  components/
    workspace.tsx           dashboard, detail panes, setup and settings
    ui/button.tsx           Radix/shadcn-style button variants
  lib/
    contracts.ts            request schemas and lifecycle
    engine.ts               approval-gated orchestration + durable events
    db.ts                   Prisma singleton
    security.ts             origin, host, paths, IPs, command policy
    browser.ts              isolated, origin-scoped Playwright capture
    files.ts                workspace artifacts and PDF export
    providers/
      types.ts              extensible AIProvider contract
      antigravity.ts        official CLI adapter, no paid API fallback
      protocol.ts           catalog, NDJSON and provider errors
prisma/
  schema.prisma             all 13 requested data models
  migrations/               committed initial SQLite migration
scripts/
  setup.mjs                 Windows-safe database bootstrap
  configure-antigravity.ps1 user-reviewed CLI safety configuration
  smoke-cli.ts              opt-in real provider test
  health.mjs                local health check
tests/core.test.ts          lifecycle, protocol, security, API contracts
e2e/workspace.spec.ts       real local export and API checks
```

Frontend → local validated API → SQLite task/event store → explicit approval → constrained provider/tool → artifacts. SSE replays persisted event IDs. ProviderConnection and ModelCatalogEntry cache discovered status/catalog; UsageRecord stores real request outcomes. User is reserved for future identity, not an authentication claim. PostgreSQL migration will require changing the datasource and generating fresh provider-specific migrations, not replaying SQLite SQL.

API: health; providers and Antigravity connect/status/models; tasks list/create/detail/events; approve/reject/cancel/pause/retry; delete task; artifacts list/download; settings GET/PATCH; usage GET. `connect` returns official login instructions, not a false connection success. Tasks remain awaiting approval until approved. Error responses are `{error:{code,message}}`.

Future local companion: move the provider/tool interfaces into a local runner; pair using a one-time scoped secret, encrypted authenticated transport, strict origin and operation scopes, per-user authorization, revocation and audit logging. No credential upload or public local-execution endpoint. This is an architectural boundary, not an implemented feature.

## Verification commands

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm smoke:cli
```

The smoke script skips by default. After official login and verified safety configuration, opt in to one real quota-consuming request:

```powershell
$env:OSKA_CLI_SMOKE='1'
pnpm smoke:cli
Remove-Item Env:OSKA_CLI_SMOKE
```

The browser E2E creates a real Files task, approves it, checks completed output and two artifacts, downloads Markdown, reloads to verify persisted history, then deletes its task records. It also tests API validation and cross-origin rejection. It never fabricates a Google model response.

## Troubleshooting

- **agy missing:** install the official CLI, ensure a native `agy.exe` is on PATH, restart the server. Do not substitute an unrelated IDE launcher. Set `AGY_EXECUTABLE` if needed.
- **Login expired:** run interactive `agy` in PowerShell and complete official sign-in. Website login alone is insufficient.
- **Safety required:** review/run the supplied script, remove alternate API-provider configuration yourself, then check Cost Safety. Restoring a previous config can intentionally disable OSKA inference again.
- **Empty catalog:** run `agy models` yourself, update the official CLI and refresh. OSKA fails closed on unrecognized output.
- **Quota exhausted:** wait for the provider's reset. Do not enable credit fallback to resolve it.
- **Chromium missing:** run `pnpm exec playwright install chromium`. Proxy/firewall restrictions may block the download.
- **Source blocked:** use a public HTTP/HTTPS URL on port 80/443. Private, local, cross-origin redirect and non-GET requests are denied. Some sites require JavaScript or prohibit automated access; OSKA does not evade protection.
- **Database setup error:** run `pnpm setup`, which normalizes the Windows SQLite path. Check that this project directory is writable and that another server is not using the database.
- **Port 3000 busy:** stop the previous OSKA instance. Health and test scripts default to port 3000. Avoid simultaneous dev/build operations against `.next`.
