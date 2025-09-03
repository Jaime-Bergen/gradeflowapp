# Use official Node.js LTS image
FROM node:20-alpine

# Install PostgreSQL client tools for pg_dump and psql
RUN apk add --no-cache postgresql-client

# Set working directory
WORKDIR /usr/src/app

# Only copy package files first for better cache
COPY backend/package*.json ./

# Install dependencies (remove --production for dev, add it for prod only)
RUN npm install

# Copy backend app source (after npm install for cache efficiency)
COPY backend/ .

# Copy frontend build files (if present)
COPY dist/ ./dist/

# Expose backend port (adjust if needed)
EXPOSE 3003

# Start the server in dev mode with nodemon
CMD ["npm", "run", "dev"]

# For production, use:
# CMD ["npm", "start"]

# TIP: Add a .dockerignore file to avoid copying node_modules, .git, etc.
