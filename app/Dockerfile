FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# VITE_API_URL is inlined at build time (browser calls this URL directly).
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build
EXPOSE 5173
# vite preview serves the built SPA with history-API fallback.
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "5173"]
