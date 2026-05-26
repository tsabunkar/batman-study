# Quick Deployment Guide for Analytics

## Overview

This guide walks you through deploying the analytics tracking system for the Batman Study app.

## Prerequisites

- AWS Account with CLI configured (`aws configure`)
- Terraform installed (`terraform --version`)
- Node.js 16+ (`node --version`)

## Step-by-Step Deployment

### 1. Verify AWS Credentials

```bash
aws sts get-caller-identity
```

You should see your AWS account details. If not, run `aws configure`.

### 2. Install Dependencies

```bash
npm install
```

### 3. Deploy Everything

```bash
npm run deploy
```

This single command will:

- Build the React app (`npm run build`)
- Initialize Terraform (`cd infra && terraform init`)
- Create all AWS resources (DynamoDB, Lambda, API Gateway, S3, CloudFront)
- Deploy the app to CloudFront

**This will take 5-10 minutes for the first deployment.**

### 4. Capture the API Endpoint

After deployment completes, look for the output:

```
Outputs:

analytics_api_endpoint = "https://xxxxx.execute-api.us-east-1.amazonaws.com/prod"
cloudfront_domain_name = "https://d2xxxxx.cloudfront.net"
...
```

**Copy the `analytics_api_endpoint` value** — you'll need it next.

### 5. Configure the API Endpoint

Create `.env.local` in the project root:

```bash
echo 'VITE_ANALYTICS_API=https://xxxxx.execute-api.us-east-1.amazonaws.com/prod' > .env.local
```

Replace `xxxxx` with the endpoint from Step 4.

### 6. Rebuild and Redeploy with API Endpoint

```bash
npm run build
npm run deploy
```

This ensures the frontend has the correct API endpoint configured.

### 7. Test the Implementation

1. **Visit your CloudFront URL**:

   ```
   https://d2xxxxx.cloudfront.net/
   ```

2. **Click the Play button** — this should trigger analytics tracking

3. **Check analytics data**:

   ```bash
   curl https://xxxxx.execute-api.us-east-1.amazonaws.com/prod/analytics
   ```

   You should see a JSON response with your IP and click count.

## Verifying the Setup

### Check DynamoDB Data

In AWS Console:

1. Go to **DynamoDB** → **Tables**
2. Open `batman-study-play-analytics` table
3. Click **Explore table items**
4. You should see one entry with your IP address

### Check Lambda Logs

In AWS Console:

1. Go to **CloudWatch** → **Log Groups**
2. Open `/aws/lambda/batman-study-track-play-click`
3. Click latest log stream to see tracking requests

### Check API Gateway

In AWS Console:

1. Go to **API Gateway** → **APIs**
2. Select `batman-study-analytics-api`
3. Check **Logs** tab for request details

## Environment Variables Reference

| Variable             | Purpose                   | Example                                                  |
| -------------------- | ------------------------- | -------------------------------------------------------- |
| `VITE_ANALYTICS_API` | API endpoint for tracking | `https://xxxxx.execute-api.us-east-1.amazonaws.com/prod` |
| `AWS_REGION`         | AWS region for resources  | `us-east-1`                                              |

## Cost Estimate

Monthly cost for typical usage (100-1000 users):

- **DynamoDB**: <$1 (pay-per-request billing)
- **Lambda**: <$0.50 (free tier: 1M requests/month)
- **API Gateway**: <$0.50 (free tier: 1M requests/month)
- **CloudFront**: ~$1 (depends on data transfer)
- **S3**: <$0.50 (storage + data transfer)

**Total: ~$2-3/month**

## Troubleshooting

### Lambda not created/updated

```bash
cd backend
rm -f lambda.zip
npm install --production
zip -r lambda.zip handler.js node_modules/
cd ../infra
```

Then redeploy.

### API endpoint not working

Check that `.env.local` has the correct URL without trailing slash:

```
✅ VITE_ANALYTICS_API=https://xxxxx.execute-api.us-east-1.amazonaws.com/prod
❌ VITE_ANALYTICS_API=https://xxxxx.execute-api.us-east-1.amazonaws.com/prod/
```

### CORS errors in browser console

This shouldn't happen as API Gateway CORS is configured for all origins. If it does:

1. Check the browser's Network tab
2. Look for the actual error response
3. Check Lambda logs for detailed errors

### High AWS charges

DynamoDB with `PAY_PER_REQUEST` billing won't incur unexpected charges. If concerned:

1. Set DynamoDB TTL to auto-delete old records
2. Monitor CloudWatch usage
3. Use AWS Cost Explorer to track actual spend

## Cleanup

To remove all AWS resources and stop incurring charges:

```bash
cd infra
terraform destroy
```

**Warning**: This will delete:

- All analytics data in DynamoDB
- Lambda functions
- API Gateway
- CloudFront distribution
- S3 buckets (with `force_destroy = true`)

## Next Steps

1. **Monitor Analytics**: Check `/analytics` endpoint daily to see user stats
2. **Set Alarms**: Create CloudWatch alarms for Lambda errors
3. **Scale**: If usage grows, consider pre-provisioning DynamoDB capacity
4. **Privacy**: Consider anonymizing IPs or adding privacy notices

For detailed technical documentation, see [ANALYTICS.md](ANALYTICS.md).
