# Full image (website + API + bot). Used by Cloud Run / cloudbuild.yaml.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY . .
# Public Discord client ID baked into the website at build time (not a secret).
ARG VITE_DISCORD_CLIENT_ID=1547515985416822884
ENV VITE_DISCORD_CLIENT_ID=$VITE_DISCORD_CLIENT_ID
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/server.cjs"]
