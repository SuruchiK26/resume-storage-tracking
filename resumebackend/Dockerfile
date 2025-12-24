FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Ensure container listens on port 80 by default
ENV PORT=80

EXPOSE 80

CMD ["node", "index.js"]


