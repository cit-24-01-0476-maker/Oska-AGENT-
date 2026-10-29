FROM node:24.16.0-bookworm-slim
ARG CODEX_VERSION=0.165.0
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip libglib2.0-0 libstdc++6 libgcc-s1 && rm -rf /var/lib/apt/lists/*
# Official Google ACP registry, version 1.4.4, linux-x86_64.
# Archive checksum is pinned; no credentials are baked into the image.
RUN mkdir -p /opt/antigravity && curl --fail --location --proto '=https' --tlsv1.2 https://dl.google.com/agy-extensions/releases/linux/agy-acp-server-1.4.4-linux-x86_64.zip -o /tmp/antigravity.zip \
 && echo 'baf31b7a97602dee359cf2a43f72b6e11c6bf354be874987d80660cd3526bb6a  /tmp/antigravity.zip' | sha256sum --check - \
 && unzip -q /tmp/antigravity.zip -d /opt/antigravity && rm /tmp/antigravity.zip \
 && chmod 755 /opt/antigravity/agy_acp_server.par /opt/antigravity/localharness_external
RUN npm install --global @openai/codex@${CODEX_VERSION} && npm cache clean --force
RUN groupadd --gid 10001 oska && useradd --uid 10001 --gid oska --create-home oska && mkdir /data && chown oska:oska /data
WORKDIR /app
COPY --chown=root:root *.mjs no-browser.sh ./
RUN chmod 755 /app/no-browser.sh
ENV HOME=/data
USER 10001:10001
EXPOSE 8788
CMD ["node","/app/worker.mjs"]
