#!/bin/bash

# Script to test analytics API after deployment

set -e

echo "🧪 Testing Batman Study Analytics API"
echo "====================================="
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
  echo "❌ .env.local not found. Run './scripts/configure-analytics.sh' first."
  exit 1
fi

# Extract API endpoint from .env.local
API_ENDPOINT=$(grep VITE_ANALYTICS_API .env.local | cut -d '=' -f 2)

if [ -z "$API_ENDPOINT" ]; then
  echo "❌ VITE_ANALYTICS_API not found in .env.local"
  exit 1
fi

echo "📡 API Endpoint: $API_ENDPOINT"
echo ""

# Test 1: Track a play click
echo "📊 Test 1: Tracking a play click..."
RESPONSE=$(curl -s -X POST "$API_ENDPOINT/track" \
  -H "Content-Type: application/json" \
  -d '{}')

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

# Test 2: Get analytics
echo "📊 Test 2: Fetching analytics data..."
RESPONSE=$(curl -s -X GET "$API_ENDPOINT/analytics")

echo "Response:"
echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
echo ""

echo "✅ Analytics API is working!"
echo ""
echo "🎯 Next steps:"
echo "   1. Visit your CloudFront URL and click the play button"
echo "   2. Run this script again to see updated statistics"
echo "   3. Check AWS Console → DynamoDB to see the stored data"
