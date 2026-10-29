# OSKA persistent agent host

This is the server package requested for browser users. Vercel remains the website and identity layer. A Linux server runs this gateway; **each verified OSKA user gets a separate non-root Docker container, Docker volume and native provider homes**. Users do not install a companion. There is no owner-account fallback, token upload, shared model catalog or invented model list.

Status: server code and Vercel bridge are implemented. Docker and Linux are unavailable in the current Windows session, so the image build, native Google/Codex login, Linux container isolation and real inference on this package are **not live verified**. The package is not connected to production yet. The website must show server setup required until hosting is connected. Provider OAuth consent and eligibility still apply; installing a native client does not grant permission to offer a public subscription pass-through service.

## Host requirements

Use an x86-64 Ubuntu/Debian VPS with Docker Engine, Node **24.16+**, Caddy, a DNS hostname and durable encrypted storage. The first version pins Google's Linux x86-64 ACP archive. It does not support ARM images. Allow at least 4 GB RAM for one active user; the default capacity is five containers with a 3 GB limit each, so size the server accordingly or lower OSKA_MAX_WORKERS. Hosting has its own cost. No server purchase or paid API has been made.

## Prepare after connecting the hosting account

1. Install Docker Engine, Node and Caddy from their official package repositories. Clone this OSKA repository to `/opt/oska-agent`. No Windows `.env`, SQLite database or local CLI credentials should be copied.
2. Build the worker image from the deliberately narrow context:

   ```sh
   cd /opt/oska-agent
   docker build --platform linux/amd64 -t oska-worker:1 agent-host
   node agent-host/prepare.mjs /root/oska-private
   install -m 600 /root/oska-private/oska-agent.env /etc/oska-agent.env
   install -m 644 agent-host/oska-agent.service /etc/systemd/system/oska-agent.service
   systemctl daemon-reload
   systemctl enable --now oska-agent
   ```

   `prepare.mjs` refuses to overwrite an existing secret. Back up that secret: changing it changes worker authentication. The gateway needs Docker authority, so its service is privileged infrastructure. It is never placed inside a user worker, and the Docker socket is never mounted into a worker. There is no API for arbitrary Docker commands, images, mounts or host paths.
3. Point `agents.YOUR-DOMAIN` to the server. Set `OSKA_AGENT_DOMAIN=agents.YOUR-DOMAIN` in Caddy's service environment, install the supplied Caddyfile, validate it with `caddy validate --config /etc/caddy/Caddyfile`, and reload Caddy. Publish only HTTPS 443 (plus 80 for certificate issuance), not gateway 8790, worker 8788 or Docker's API. Caddy forwards to gateway loopback; every non-health request requires a signed server request.
4. In Vercel **Production**, configure:

   ```dotenv
   OSKA_AGENT_ORIGIN=https://agents.YOUR-DOMAIN
   OSKA_AGENT_SECRET=the-private-secret-generated-on-the-server
   ```

   Use Vercel's sensitive environment input or CLI stdin. Do not put the secret in source, browser JavaScript, a URL or this chat. Redeploy the website. The hostname must be an exact HTTPS origin with no path.
5. Sign in to OSKA → **Connections → Your model accounts**. Connect Antigravity or Codex. Refresh models after completing the official provider flow. Select a discovered model and run a short test. Each user must connect their own account; a successful Google website sign-in is separate.

Antigravity uses Google's official ACP runtime, not the existing `agy` adapter. The pinned archive is downloaded directly from `dl.google.com` and checked against the ACP registry SHA-256. It has separate credentials from Antigravity desktop/legacy CLI logins. If its native callback points to `http://127.0.0.1:PORT/` on the server, the user pastes the complete failed redirect into OSKA's dedicated connection field. Only the exact active listener, state and path are accepted; it is never forwarded to a client-chosen server or logged. Codex uses app-server's official device-code flow, so users enter its short code on `auth.openai.com/codex/device`.

## Execution and boundaries

- The server discovers account models through ACP session config or Codex `model/list`. Catalog visibility is not a promise that inference will succeed under plan/quota restrictions.
- Text tasks run with native permissions denied; Codex requests use a read-only sandbox. Team drafts with assigned live model IDs run sequential roles, carrying previous role output as task data. This version does **not** implement browser/computer tools, code execution, arbitrary filesystem tools, scheduling or parallel team runs.
- HTTP returns job IDs immediately; the website polls. Native processes and credentials outlive Vercel requests. Non-login jobs persist in each user's volume. Interrupted jobs are marked interrupted after restart; there is no hidden replay or automatic charge.
- Login jobs, Google redirect URLs and device codes are memory-only. Responses are no-store. Never enable request-body logging in a proxy. Provider raw stderr never reaches the browser or server logs.
- Vercel derives the tenant from the server-verified subject. Requests carry an HMAC over tenant, timestamp, nonce, method, path and body digest. The gateway rejects expired/replayed/altered messages. A browser cannot choose its tenant. Worker tokens differ per tenant and never reach native provider children. The gateway binds only to host loopback and workers are published only on loopback.
- Docker namespace isolation is not a complete hostile multi-tenant sandbox. Before an untrusted public launch, validate the image and runtime on the target host, restrict egress (including cloud metadata/private networks), configure disk quotas and deletion/backup policy, test native approval denial and harden container/VM isolation. Do not mount provider credentials from the operator's home.
- Worker creation is capped; an operator must deliberately deprovision inactive tenants to reclaim capacity. Volumes are not deleted automatically. A host restart revokes pending in-memory login flows.

## Verification before opening to users

Run `node --test agent-host/test/*.test.mjs`, `pnpm test`, `pnpm typecheck` and the cloud build. On Linux, build the image, confirm the gateway's public HTTPS health, then use two real OSKA test users: log each into their own provider, discover models, run one text request and one assigned team, restart the host, and confirm one user's jobs/models/files cannot be fetched by the other. Log out/revocation, native runtime updates and quota failures also need live checks. Unit fixtures do not prove any of these native-provider behaviors.

Protocol references: [official Antigravity ACP registry](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json), [Codex app-server](https://learn.chatgpt.com/docs/app-server), [MausBot's native runtime architecture](https://docs.openmausbot.com/docs/providers/antigravity). No OpenMausBot source code is embedded in this package.
