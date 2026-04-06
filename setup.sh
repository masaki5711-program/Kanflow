#!/bin/sh
set -e

echo "=== Scrum Tool Setup ==="

# 1. Create .env from .env.example if it doesn't exist
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
    echo "[OK] .env created from .env.example"
    echo ""
    echo ">>> IMPORTANT: Edit .env and set your passwords before starting! <<<"
    echo "    Required changes:"
    echo "      MYSQL_ROOT_PASSWORD"
    echo "      MYSQL_APP_PASSWORD"
    echo "      NEXTAUTH_SECRET (generate with: openssl rand -base64 32)"
    echo "      COLLABORA_ADMIN_PASSWORD"
    echo ""
    echo "After editing .env, run this script again."
    exit 0
  else
    echo "ERROR: .env.example not found. Is this the project root?"
    exit 1
  fi
else
  echo "[OK] .env already exists"
fi

# 2. Validate required variables are not placeholder values
. ./.env 2>/dev/null || true

missing=""
for var in MYSQL_ROOT_PASSWORD MYSQL_APP_PASSWORD NEXTAUTH_SECRET; do
  eval val=\$$var
  if [ -z "$val" ]; then
    missing="$missing $var"
  fi
done

if [ -n "$missing" ]; then
  echo "ERROR: Missing required values in .env:$missing"
  echo "Edit .env and fill in the required values."
  exit 1
fi

echo "[OK] .env validated"

# 3. Start Docker Compose
echo ""
echo "Starting Docker containers..."
docker compose up --build -d

echo ""
echo "=== Setup Complete ==="
echo "App:       http://localhost:3000"
echo "Collabora: http://localhost:9980"
echo ""
echo "View logs: docker compose logs -f"
