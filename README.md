# Batman Study

A React + Vite web app built around the experience of working with handpan music.

## What this app is

`batman-study` is a small creative project focused on handpan music practice and exploration.
It is designed to showcase content, sound, or guided study related to handpan playing,
with a simple static React frontend deployed to AWS S3 behind CloudFront.

## Key features

- React app powered by Vite
- Static deployment to AWS S3
- Global CDN delivery with CloudFront
- SPA-friendly routing with `index.html` fallback

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
