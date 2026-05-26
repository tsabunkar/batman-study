#!/bin/bash

# Script to extract API endpoint from Terraform and configure .env.local

set -e

echo "🦇 Batman Study Analytics Configuration"
echo "========================================"
echo ""

# Check if Terraform has been initialized
if [ ! -d "infra/.terraform" ]; then
  echo "❌ Terraform not initialized. Run 'npm run deploy' first."
  exit 1
fi

# Get the API endpoint from Terraform
cd infra

echo "📡 Fetching API endpoint from Terraform..."
API_ENDPOINT=$(terraform output -raw analytics_api_endpoint 2>/dev/null || echo "")

if [ -z "$API_ENDPOINT" ]; then
  echo "❌ Could not fetch API endpoint. Did you run 'npm run deploy'?"
  exit 1
fi

cd ..

echo "✅ Found API endpoint: $API_ENDPOINT"
echo ""

# Create/update .env.local
echo "📝 Creating .env.local..."
echo "VITE_ANALYTICS_API=$API_ENDPOINT" > .env.local

echo "✅ .env.local updated successfully!"
echo ""
echo "🔧 Configuration complete. You can now:"
echo "   1. Run 'npm run build' to rebuild the app"
echo "   2. Run 'npm run deploy' to redeploy with the API endpoint"
echo ""
echo "📊 To test analytics:"
echo "   curl \"$API_ENDPOINT/analytics\""
