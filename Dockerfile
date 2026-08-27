FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx prisma generate && npm run build

# web:    docker run … npm start
# worker: docker run … npm run worker
EXPOSE 3000
CMD ["npm", "start"]
