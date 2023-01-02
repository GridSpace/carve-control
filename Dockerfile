# syntax=docker/dockerfile:1

FROM node:12.18.1
ENV NODE_ENV=production

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

RUN npm install --production

COPY . .

RUN npm install -g browserify
RUN npm run bundle

ENTRYPOINT [ "node", "lib/main" ]
