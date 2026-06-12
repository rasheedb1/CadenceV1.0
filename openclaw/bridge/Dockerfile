# Chief Bridge + OpenClaw Runtime
FROM ghcr.io/openclaw/openclaw:latest

USER root
# Chromium runtime libs are required by @sparticuz/chromium for the PDF endpoint
# (/api/bc/:slug/pdf). The chromium binary itself is bundled by the npm package.
RUN apt-get update && apt-get install -y --no-install-recommends \
  curl jq python3 python3-pip fonts-dejavu \
  libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 \
  libcairo2 libasound2 \
  ghostscript \
  && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir --break-system-packages python-pptx Pillow
USER node

# OpenClaw config
COPY --chown=node:node openclaw.json /home/node/.openclaw/openclaw.json

# OpenClaw workspace (SOUL.md for Chief)
COPY --chown=node:node workspace/ /home/node/.openclaw/workspace/

# Bridge app
WORKDIR /home/node/bridge
COPY --chown=node:node package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --chown=node:node server.js pgmq.js a2a-client.js generate_business_case.js generate_contract.js ./
COPY --chown=node:node assets/ ./assets/
COPY --chown=node:node chat/ ./chat/

# Startup
COPY --chown=node:node startup.sh /home/node/bridge/startup.sh

EXPOSE 3100

CMD ["bash", "/home/node/bridge/startup.sh"]
