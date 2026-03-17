#!/bin/sh
set -e

echo "=== Scrum Tool - Starting ==="

# 1. Check required environment variables
missing=""
for var in DATABASE_HOST DATABASE_PORT DATABASE_USER DATABASE_PASSWORD DATABASE_NAME NEXTAUTH_SECRET; do
  eval val=\$$var
  if [ -z "$val" ]; then
    missing="$missing $var"
  fi
done

if [ -n "$missing" ]; then
  echo "ERROR: Missing required environment variables:$missing"
  echo "Set them in .env or docker-compose.yml"
  exit 1
fi

# 2. Wait for MySQL to accept connections (belt-and-suspenders beyond healthcheck)
echo "Waiting for MySQL at ${DATABASE_HOST}:${DATABASE_PORT}..."
timeout=30
elapsed=0
while ! nc -z "$DATABASE_HOST" "$DATABASE_PORT" 2>/dev/null; do
  elapsed=$((elapsed + 1))
  if [ "$elapsed" -ge "$timeout" ]; then
    echo "ERROR: MySQL not reachable after ${timeout}s"
    exit 1
  fi
  sleep 1
done
echo "MySQL is ready."

# 3. Run Prisma migrations
echo "Running database migrations..."
npx prisma migrate deploy --schema=prisma/schema.prisma
echo "Migrations complete."

# 4. Start Next.js
echo "Starting Next.js server..."
exec node server.js
