FROM node:22-alpine

WORKDIR /app

ENV VITE_API_BASE_URL=http://127.0.0.1:8000

COPY frontend/package*.json ./
RUN npm ci

COPY frontend ./
RUN chown -R node:node /app

USER node

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
