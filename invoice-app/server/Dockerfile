FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
FROM node:18-slim
WORKDIR /app

# Install build tools so native modules (sqlite3) can be compiled inside the image
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 build-essential make g++ libc6-dev pkg-config \
	&& rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
# Install production dependencies and force build of native modules
RUN npm ci --only=production --build-from-source || npm install --production

COPY . .

# Rebuild sqlite3 from source if present (fallback)
RUN npm rebuild sqlite3 --build-from-source || true

# Remove apt lists to keep image smaller
RUN apt-get purge -y --auto-remove python3 build-essential make g++ pkg-config || true \
	&& rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* || true

EXPOSE 3000
CMD ["node", "index.js"]
