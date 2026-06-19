FROM node:22-alpine AS builder

WORKDIR /app/frontend

COPY package.json package-lock.json* ./
RUN npm ci --silent

# Copy source
COPY . .

# Build → output to /app/services/api/static
# In Docker: we mount the output as a volume or use multi-stage copy
RUN npm run build -- --outDir /build

# ── Output stage: just the built assets ──────────────────
FROM scratch AS export
COPY --from=builder /build /
