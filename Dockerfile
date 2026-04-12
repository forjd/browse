# syntax=docker/dockerfile:1.7

FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
COPY patches ./patches
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY src ./src
RUN bun run build

FROM mcr.microsoft.com/playwright:v1.54.1-noble AS runtime
WORKDIR /work
COPY --from=build /app/dist/browse /usr/local/bin/browse
ENTRYPOINT ["browse"]
CMD ["--help"]
