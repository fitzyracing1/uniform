FROM node:22-alpine
# tar comes with alpine (busybox); the service streams GitHub tarballs into it
RUN apk add --no-cache tar
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
USER node
CMD ["node", "service/server.js"]
