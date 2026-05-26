# ============================================================
# S3 Bucket — Static website hosting
# ============================================================

resource "aws_s3_bucket" "website" {
  bucket        = "${var.project_name}-${var.environment}-${random_id.bucket_suffix.hex}"
  force_destroy = true

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Block all public access — CloudFront will serve content via OAC
resource "aws_s3_bucket_public_access_block" "website" {
  bucket = aws_s3_bucket.website.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket policy — allow CloudFront OAC to read objects
resource "aws_s3_bucket_policy" "website" {
  bucket = aws_s3_bucket.website.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.website.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.website.arn
          }
        }
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.website]
}

# ============================================================
# CloudFront — CDN Distribution
# ============================================================

resource "aws_cloudfront_origin_access_control" "website" {
  name                              = "${var.project_name}-oac"
  description                       = "OAC for ${var.project_name} S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "website" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${var.project_name} - Static Website"
  price_class         = "PriceClass_200"
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.website.bucket_regional_domain_name
    origin_id                = "S3-${aws_s3_bucket.website.id}"
    origin_access_control_id = aws_cloudfront_origin_access_control.website.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.website.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 0
    default_ttl = 86400    # 1 day
    max_ttl     = 31536000 # 1 year
  }

  # Cache static assets aggressively
  ordered_cache_behavior {
    path_pattern           = "/assets/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.website.id}"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    min_ttl     = 31536000
    default_ttl = 31536000
    max_ttl     = 31536000
  }

  # SPA fallback: serve index.html for 403/404
  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "null_resource" "app_deploy" {
  depends_on = [aws_cloudfront_distribution.website]

  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command = <<EOT
      set -euo pipefail
      cd "${path.module}/.."
      npm run build

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --delete \
        --exclude "*" \
        --include "*.html" \
        --cache-control "public, max-age=60, s-maxage=300" \
        --content-type "text/html"

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --exclude "*" \
        --include "*.js" \
        --cache-control "public, max-age=31536000, immutable" \
        --content-type "application/javascript"

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --exclude "*" \
        --include "*.css" \
        --cache-control "public, max-age=31536000, immutable" \
        --content-type "text/css"

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --exclude "*" \
        --include "*.png" --include "*.jpg" --include "*.jpeg" \
        --include "*.gif" --include "*.webp" --include "*.svg" --include "*.ico" \
        --cache-control "public, max-age=31536000, immutable"

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --exclude "*.html" \
        --exclude "*.js" \
        --exclude "*.css" \
        --exclude "*.png" --exclude "*.jpg" --exclude "*.jpeg" \
        --exclude "*.gif" --exclude "*.webp" \
        --exclude "*.svg" --exclude "*.ico" \
        --cache-control "public, max-age=86400"

      aws cloudfront create-invalidation --distribution-id "${aws_cloudfront_distribution.website.id}" --paths "/*"
    EOT
    interpreter = ["bash", "-c"]
  }
}
