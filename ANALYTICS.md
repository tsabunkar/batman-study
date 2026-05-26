# Batman Study - Analytics Tracking

## Overview

This implementation adds analytics tracking to monitor play button clicks with user IP addresses, click counts, and timestamps. The data is stored in DynamoDB and exposed through an API Gateway.

## Architecture

- **Frontend**: React/Vite app sends play button click events
- **Backend**: AWS Lambda functions process tracking requests
- **API**: API Gateway HTTP endpoints for tracking and analytics
- **Storage**: DynamoDB table stores user analytics data
- **Infrastructure**: Terraform manages all AWS resources

## Components

### 1. Backend Lambda Functions (`backend/handler.js`)

Two Lambda functions:

#### `trackPlayClick`

- Endpoint: `POST /track`
- Extracts user IP address from request headers
- Creates or updates user record in DynamoDB
- Returns: User's click count and last clicked timestamp

#### `getAnalytics`

- Endpoint: `GET /analytics`
- Scans all analytics data from DynamoDB
- Returns: Total users, total clicks, and per-user statistics

### 2. DynamoDB Table Schema

**Table Name**: `batman-study-play-analytics`

**Attributes**:

```
{
  "ipAddress": "String (Primary Key)",
  "clickCount": "Number",
  "firstVisitedAt": "String (ISO datetime)",
  "lastClickedAt": "String (ISO datetime)",
  "expiresAt": "Number (TTL in seconds since epoch)" // Optional, for auto-cleanup
}
```

### 3. Frontend Integration

The React component tracks plays by sending a POST request to the Lambda function:

```javascript
fetch(`${ANALYTICS_API_ENDPOINT}/track`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
```

## Deployment

### Prerequisites

- AWS Account with appropriate IAM permissions
- Terraform >= 1.0
- Node.js >= 16
- AWS CLI configured

### Step 1: Configure Environment

1. Copy `.env.example` to `.env.local`:

   ```bash
   cp .env.example .env.local
   ```

2. After deploying infrastructure (Step 3), update the `VITE_ANALYTICS_API` with the endpoint from Terraform outputs.

### Step 2: Build the React App

```bash
npm run build
```

### Step 3: Deploy Infrastructure

```bash
npm run deploy
```

This will:

1. Build the React application
2. Initialize Terraform
3. Create DynamoDB table
4. Create Lambda functions
5. Create API Gateway
6. Deploy frontend to CloudFront
7. Output the analytics API endpoint

### Step 4: Update Environment Variables

After deployment, Terraform will output the `analytics_api_endpoint`. Add it to your `.env.local`:

```bash
VITE_ANALYTICS_API=https://xxxxx.execute-api.us-east-1.amazonaws.com/prod
```

Then rebuild and redeploy:

```bash
npm run build
npm run deploy
```

## API Reference

### Track Play Click

**Request:**

```bash
curl -X POST https://your-api-endpoint/track \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Response:**

```json
{
  "success": true,
  "message": "Click tracked successfully",
  "data": {
    "ipAddress": "203.0.113.42",
    "clickCount": 5,
    "firstVisitedAt": "2024-05-26T10:30:00.000Z",
    "lastClickedAt": "2024-05-26T14:45:30.000Z"
  }
}
```

### Get Analytics

**Request:**

```bash
curl -X GET https://your-api-endpoint/analytics
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalUsers": 42,
    "totalClicks": 156,
    "users": [
      {
        "ipAddress": "203.0.113.42",
        "clickCount": 12,
        "firstVisitedAt": "2024-05-26T10:30:00.000Z",
        "lastClickedAt": "2024-05-26T14:45:30.000Z"
      },
      {
        "ipAddress": "198.51.100.89",
        "clickCount": 8,
        "firstVisitedAt": "2024-05-26T11:00:00.000Z",
        "lastClickedAt": "2024-05-26T13:20:15.000Z"
      }
    ]
  }
}
```

## Data Storage Details

### DynamoDB Design

- **Partition Key**: `ipAddress` (ensures one record per IP)
- **Billing Mode**: PAY_PER_REQUEST (pay only for what you use)
- **TTL**: Optional field `expiresAt` for automatic data cleanup
- **Point-in-time Recovery**: Enabled for disaster recovery

### Costs

- **Reads/Writes**: ~$1.25 per million requests
- **Storage**: ~$0.25 per GB per month
- **Lambda**: Free tier covers 1 million requests/month
- **API Gateway**: ~$3.50 per million requests

For a small app with 100-1000 users, expect <$2/month for analytics.

## Monitoring

### CloudWatch Logs

Lambda logs are available in CloudWatch:

- Track Function: `/aws/lambda/batman-study-track-play-click`
- Analytics Function: `/aws/lambda/batman-study-get-analytics`

### API Gateway Logs

Access logs with request/response details:

- Log Group: `/aws/apigateway/batman-study-analytics-api`

## IP Address Privacy

This implementation stores raw IP addresses. Consider:

1. **GDPR/Privacy Compliance**: IP addresses are personal data
2. **Consent**: Ensure users know about tracking
3. **IP Anonymization**: Mask last octet: `203.0.113.0` instead of `203.0.113.42`
4. **Data Retention**: Use DynamoDB TTL to auto-delete old records

To anonymize IPs, modify `handler.js`:

```javascript
const anonymizeIp = (ip) => {
  const parts = ip.split(".");
  if (parts.length === 4) {
    parts[3] = "0"; // Mask last octet
  }
  return parts.join(".");
};
```

## Troubleshooting

### Lambda Function Not Found

Ensure `backend/lambda.zip` was created during `npm run deploy`

### CORS Errors

API Gateway CORS is configured for all origins (`*`). If you want to restrict:

Edit `infra/main.tf` in the `aws_apigatewayv2_api` resource:

```hcl
cors_configuration {
  allow_origins = ["https://yourdomain.com"]
  allow_methods = ["GET", "POST"]
  allow_headers = ["Content-Type"]
  max_age       = 300
}
```

### DynamoDB Throughput Exceeded

The table uses PAY_PER_REQUEST billing which auto-scales. If you see throttling errors, it's likely a Lambda cold start issue. Increase memory to improve performance.

## Cleanup

To remove all resources:

```bash
cd infra
terraform destroy
```

**Warning**: This will delete the DynamoDB table and all analytics data.

## Files Modified

- `src/App.jsx`: Added analytics tracking on play button click
- `infra/main.tf`: Added DynamoDB, Lambda, API Gateway resources
- `infra/outputs.tf`: Added API endpoint outputs
- `backend/handler.js`: Lambda function implementation
- `backend/package.json`: Lambda dependencies
- `.env.example`: Environment variable template

## Next Steps

1. Deploy the infrastructure: `npm run deploy`
2. Note the `analytics_api_endpoint` from Terraform output
3. Update `.env.local` with the endpoint
4. Rebuild and redeploy
5. Test by visiting the site and clicking play
6. View analytics at `/analytics` endpoint
