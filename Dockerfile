# Backend (bookmarks API). Built and pushed to ghcr.io by CI for each v* tag;
# backend/deploy/compose.yaml runs it on the server. The frontend is on GitHub Pages.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json yarn.lock ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN yarn install --frozen-lockfile --non-interactive
COPY tsconfig.base.json ./
COPY shared shared
COPY backend backend
# tsup bundles everything into backend/dist/server.js, so the runtime image needs no node_modules.
RUN yarn workspace @compiler/backend build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/backend/dist ./dist
USER node
EXPOSE 8788
CMD ["node", "--enable-source-maps", "dist/server.js"]
