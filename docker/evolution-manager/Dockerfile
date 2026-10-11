FROM node:20-alpine AS build

ARG VITE_EVOLUTION_API_URL=http://localhost:8080
ARG VITE_EVOLUTION_API_KEY=
ARG VITE_APP_NAME="ALETIS Evolution Manager"

ENV VITE_EVOLUTION_API_URL=$VITE_EVOLUTION_API_URL
ENV VITE_EVOLUTION_API_KEY=$VITE_EVOLUTION_API_KEY
ENV VITE_APP_NAME=$VITE_APP_NAME

RUN apk add --no-cache git
WORKDIR /app
RUN git clone --depth 1 https://github.com/EvolutionAPI/evolution-manager-v2.git .
RUN npm ci
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
