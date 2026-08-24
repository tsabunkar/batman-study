#!/usr/bin/env bash
# Frontend-only deploy: builds the React app, syncs dist/ to the live
# CloudFront origin bucket, and invalidates the CDN cache.
#
# Deliberately does NOT touch DynamoDB, Lambda, API Gateway or Terraform —
# the full `npm run deploy` is unsafe until the Terraform state is repaired.
set -euo pipefail

BUCKET="s3://batman-study-prod-1e1e7fa9" # live origin (NOT the stale b08d6e29 tracked by TF state)
REGION="ap-south-1"
DISTRIBUTION_ID="E25YA74JUQALKA"

echo "==> Building frontend..."
npm run build

if [ ! -f dist/index.html ]; then
  echo "ERROR: dist/index.html missing after build; aborting." >&2
  exit 1
fi

echo "==> Syncing dist/ to $BUCKET ..."

aws s3 sync dist/ "$BUCKET" --region "$REGION" --delete \
  --exclude "*" --include "*.html" \
  --cache-control "public, max-age=60, s-maxage=300" \
  --content-type "text/html"

aws s3 sync dist/ "$BUCKET" --region "$REGION" \
  --exclude "*" --include "*.js" \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type "application/javascript"

aws s3 sync dist/ "$BUCKET" --region "$REGION" \
  --exclude "*" --include "*.css" \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type "text/css"

aws s3 sync dist/ "$BUCKET" --region "$REGION" \
  --exclude "*" --include "*.png" --include "*.jpg" --include "*.jpeg" \
  --include "*.gif" --include "*.webp" --include "*.svg" --include "*.ico" \
  --cache-control "public, max-age=31536000, immutable"

aws s3 sync dist/ "$BUCKET" --region "$REGION" \
  --exclude "*.html" --exclude "*.js" --exclude "*.css" \
  --exclude "*.png" --exclude "*.jpg" --exclude "*.jpeg" \
  --exclude "*.gif" --exclude "*.webp" \
  --exclude "*.svg" --exclude "*.ico" \
  --cache-control "public, max-age=86400"

echo "==> Invalidating CloudFront distribution $DISTRIBUTION_ID ..."
INVALIDATION_ID=$(aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" --paths "/*" \
  --query 'Invalidation.Id' --output text)

echo "==> Invalidation $INVALIDATION_ID submitted (live in ~1-2 min)."
echo "==> Frontend deployed."
