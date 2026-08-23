# Multi-stage build for RoIron API

# Stage 1: Build
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Production
FROM node:18-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Install production dependencies
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copy application files
COPY --chown=nodejs:nodejs . .

# Generate Prisma client
RUN npx prisma generate

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE ${PORT}

# Switch to non-root user
USER nodejs

# Start application
CMD ["node", "src/server.js"]
