# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.base.json vite.config.ts vitest.config.ts index.html ./
COPY design-kit ./design-kit
COPY public ./public
COPY scripts ./scripts
COPY server ./server
COPY shared ./shared
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=8787 \
    STORAGE_DIR=/data/objectquest
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --chown=node:node deploy/register-aliases.mjs deploy/alias-loader.mjs ./deploy/

RUN mkdir -p /data/objectquest && chown node:node /data/objectquest
USER node

EXPOSE 8787
VOLUME ["/data/objectquest"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["npm", "start"]
