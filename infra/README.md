# Terraform deployment for Batman Study

This directory provisions the S3 bucket and CloudFront CDN for the React app.

## Deployment

From the repository root:

```bash
npm run deploy
```

That runs:

```bash
cd infra && terraform init && terraform apply -auto-approve
```

## Requirements

- AWS CLI installed and configured with valid credentials
- Terraform installed
- Node.js installed (for `npm run build`)

## What happens during deploy

- Terraform creates an S3 bucket, CloudFront distribution, and origin access control
- A local provisioner builds the React app
- Build output is synced to the S3 bucket
- CloudFront cache is invalidated for `/*`

## Notes

- The app is served securely through CloudFront, with `index.html` fallback for SPA routing.
- The bucket is not public; CloudFront reads objects through OAC.
