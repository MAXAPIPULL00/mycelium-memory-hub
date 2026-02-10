# Mycelium Memory Hub
FROM node:18-alpine

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ postgresql-client

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies and rebuild for Alpine
RUN npm ci --only=production && npm rebuild

# Copy source code
COPY . .

# Create data directory
RUN mkdir -p /app/data

# Set production environment
ENV NODE_ENV=production

# Expose port (Cloud Run will set PORT env var)
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3002}/health || exit 1

# Start application
CMD ["npm", "start"]

