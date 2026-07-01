# Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Pass backend URL at build time if needed
# ARG VITE_API_URL
# ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Production server stage using Nginx
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# We will mount our own custom nginx config using docker-compose
# EXPOSE 80 done in docker-compose

CMD ["nginx", "-g", "daemon off;"]
