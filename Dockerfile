# Stage 1: Build frontend
FROM node:20-slim AS builder
WORKDIR /build
COPY package*.json ./
RUN npm install
COPY src ./src
COPY public ./public
COPY index.html ./
COPY vite.config.js* ./
RUN npm run build

# Stage 2: Python server container
FROM python:3.11-slim

# Install Docker CLI and Compose plugin
RUN apt-get update && apt-get install -y ca-certificates curl gnupg && \
    install -m 0755 -d /etc/apt/keyrings && \
    curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc && \
    chmod a+r /etc/apt/keyrings/docker.asc && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list && \
    apt-get update && apt-get install -y docker-ce-cli docker-compose-plugin && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy python requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy built frontend assets from Stage 1
COPY --from=builder /build/dist ./dist

# Copy the rest of the application
COPY . .

EXPOSE 8000

# Run as root to ensure access to /var/run/docker.sock for managing containers
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
