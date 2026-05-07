FROM node:22-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./

COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/ventas-pro/package.json ./artifacts/ventas-pro/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/db/package.json ./lib/db/
COPY lib/integrations-openai-ai-server/package.json ./lib/integrations-openai-ai-server/
COPY lib/integrations-openai-ai-react/package.json ./lib/integrations-openai-ai-react/
COPY scripts/package.json ./scripts/

RUN pnpm install --frozen-lockfile --no-optional

COPY . .

RUN pnpm run build

FROM node:22-slim

WORKDIR /app
RUN corepack enable

COPY --from=base /app /app

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

CMD ["pnpm", "--filter", "@workspace/api-server", "run", "start"]
