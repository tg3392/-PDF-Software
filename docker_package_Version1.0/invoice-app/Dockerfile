# Frontend Dockerfile - multi-stage: build with node, serve with nginx
FROM node:18-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

# Production image
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Optional: custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
