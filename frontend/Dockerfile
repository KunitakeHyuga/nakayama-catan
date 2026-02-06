FROM node:20-slim AS build

WORKDIR /opt/catanatron/ui

COPY catanatron-src/ui ./

RUN npm ci

ARG CTRON_API_URL=http://localhost:5001
ARG CTRON_PUBLIC_URL=
ENV CTRON_API_URL=${CTRON_API_URL}
ENV CTRON_PUBLIC_URL=${CTRON_PUBLIC_URL}

RUN npm run build

FROM nginx:1.27-alpine

COPY --from=build /opt/catanatron/ui/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
