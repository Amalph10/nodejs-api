# Stage 1: Build dependencies
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Stage 2: Production image
FROM node:20-alpine

# Set to production mode
ENV NODE_ENV=production

WORKDIR /usr/src/app

# Copy dependency artifacts from builder
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY package*.json ./
COPY index.js ./

# Use a non-privileged system user for running the application
USER node

# Expose port
EXPOSE 3000

# Start command
CMD [ "node", "index.js" ]
