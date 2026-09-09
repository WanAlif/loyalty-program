#!/bin/sh
set -e

# Apply any pending Prisma migrations before the server starts — this is
# what makes `docker compose up` bring up a fully working, migrated
# database with no manual step, matching a real deploy pipeline.
echo "Applying database migrations..."
npx prisma migrate deploy

echo "Starting server..."
exec node dist/index.js
