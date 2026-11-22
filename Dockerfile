FROM node:24.22.3-trixie-slim@sha256:af02d57b57719b9657a45199a79264a9437940cd55b3c7b3fc99615654f124a0 AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:worker \
 && npm prune --omit=dev --no-audit --no-fund \
 && rm -rf .next/standalone/node_modules


FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:6abfcb367ebc291572c774c1592a986be2ab26a2486f73093401327495a5962a
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    CHECKPOINT_DISABLE=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma.config.ts ./
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
COPY --from=build /app/dist ./dist
COPY --from=build --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=build --chown=nonroot:nonroot /app/.next/static ./.next/static

# web:        node server.js (default)
# worker:     node dist/worker.mjs
# migrations: node node_modules/prisma/build/index.js migrate deploy
EXPOSE 3000
CMD ["server.js"]
