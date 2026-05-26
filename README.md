# Batman Study

A React + Vite web app built around the experience of working with handpan music.

## What this app is

`batman-study` is a minimalist creative space where handpan music groove blocks noise and distractions, letting you work with Batman-level focus and flow.

## Link to use-

https://d2sp3xp56r8kh5.cloudfront.net/

## Key features

- React app powered by Vite
- Static deployment to AWS S3
- Global CDN delivery with CloudFront
- SPA-friendly routing with `index.html` fallback
- **User analytics tracking** with IP-based click counting via Lambda + DynamoDB

## Analytics

This app includes built-in analytics to track play button clicks. Each user (by IP address) is counted with:

- Click count on play button
- First visit timestamp
- Last click timestamp

See [ANALYTICS.md](ANALYTICS.md) for detailed setup and deployment instructions.

## Local development

```bash
npm install
npm run dev
```

Then open the local Vite URL shown in the terminal.

## Build

```bash
npm run build
```

## Deploy

This repository uses Terraform to provision AWS infrastructure and deploy the app.

```bash
npm run deploy
```

That command runs Terraform from `infra/`, creates the website bucket and CloudFront distribution,
and uploads the built app to S3.

## Notes

- The app is intended as a hands-on handpan music study experience.
- `infra/README.md` has more details on the Terraform deployment flow.
