# ============================================================
# S3 Bucket — Static website hosting
# ============================================================

resource "aws_s3_bucket" "website" {
  provider      = aws.ap_south_1
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
  provider = aws.ap_south_1
  bucket   = aws_s3_bucket.website.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Bucket policy — allow CloudFront OAC to read objects
resource "aws_s3_bucket_policy" "website" {
  provider = aws.ap_south_1
  bucket   = aws_s3_bucket.website.id

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
      export VITE_ANALYTICS_API="${aws_apigatewayv2_stage.analytics_stage.invoke_url}"
      npm run build

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --region ap-south-1 \
        --delete \
        --exclude "*" \
        --include "*.html" \
        --cache-control "public, max-age=60, s-maxage=300" \
        --content-type "text/html"

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --region ap-south-1 \
        --exclude "*" \
        --include "*.js" \
        --cache-control "public, max-age=31536000, immutable" \
        --content-type "application/javascript"

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --region ap-south-1 \
        --exclude "*" \
        --include "*.css" \
        --cache-control "public, max-age=31536000, immutable" \
        --content-type "text/css"

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --region ap-south-1 \
        --exclude "*" \
        --include "*.png" --include "*.jpg" --include "*.jpeg" \
        --include "*.gif" --include "*.webp" --include "*.svg" --include "*.ico" \
        --cache-control "public, max-age=31536000, immutable"

      aws s3 sync dist/ "s3://${aws_s3_bucket.website.id}" \
        --region ap-south-1 \
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

# ============================================================
# DynamoDB Table for Analytics
# ============================================================

resource "aws_dynamodb_table" "play_analytics" {
  name         = "${var.project_name}-play-analytics"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "ipAddress"

  attribute {
    name = "ipAddress"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ============================================================
# IAM Role and Policy for Lambda
# ============================================================

resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy" "lambda_dynamodb_policy" {
  name   = "${var.project_name}-lambda-dynamodb-policy"
  role   = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Effect   = "Allow"
        Resource = aws_dynamodb_table.play_analytics.arn
      },
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Effect   = "Allow"
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      }
    ]
  })
}

# ============================================================
# Lambda Function for Tracking
# ============================================================

resource "aws_lambda_function" "track_play_click" {
  depends_on = [
    aws_iam_role_policy.lambda_dynamodb_policy
  ]

  filename         = "${path.module}/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda.zip")
  function_name    = "${var.project_name}-track-play-click"
  role             = aws_iam_role.lambda_role.arn
  handler          = "handler.trackPlayClick"
  timeout          = 30
  memory_size      = 256
  runtime          = "nodejs18.x"

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.play_analytics.name
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_lambda_function" "get_analytics" {
  depends_on = [
    aws_iam_role_policy.lambda_dynamodb_policy
  ]

  filename         = "${path.module}/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/lambda.zip")
  function_name    = "${var.project_name}-get-analytics"
  role             = aws_iam_role.lambda_role.arn
  handler          = "handler.getAnalytics"
  timeout          = 30
  memory_size      = 256
  runtime          = "nodejs18.x"

  environment {
    variables = {
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.play_analytics.name
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}



# ============================================================
# API Gateway for Analytics
# ============================================================

resource "aws_apigatewayv2_api" "analytics_api" {
  name          = "${var.project_name}-analytics-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "OPTIONS"]
    allow_headers = ["*"]
    max_age       = 300
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# ============================================================
# IAM Role for API Gateway to invoke Lambda
# ============================================================

resource "aws_iam_role" "api_gateway_role" {
  name = "${var.project_name}-api-gateway-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_iam_role_policy" "api_gateway_invoke_lambda" {
  name = "${var.project_name}-api-gateway-invoke-lambda"
  role = aws_iam_role.api_gateway_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = "lambda:InvokeFunction"
        Effect   = "Allow"
        Resource = [
          aws_lambda_function.track_play_click.arn,
          aws_lambda_function.get_analytics.arn
        ]
      }
    ]
  })
}

# ============================================================
# Integration for track endpoint
# ============================================================

resource "aws_apigatewayv2_integration" "track_integration" {
  api_id             = aws_apigatewayv2_api.analytics_api.id
  integration_type   = "AWS_PROXY"
  integration_method = "POST"
  integration_uri    = aws_lambda_function.track_play_click.invoke_arn
  payload_format_version = "2.0"
  credentials_arn    = aws_iam_role.api_gateway_role.arn
}

# Integration for analytics endpoint
resource "aws_apigatewayv2_integration" "analytics_integration" {
  api_id             = aws_apigatewayv2_api.analytics_api.id
  integration_type   = "AWS_PROXY"
  integration_method = "POST"
  integration_uri    = aws_lambda_function.get_analytics.invoke_arn
  payload_format_version = "2.0"
  credentials_arn    = aws_iam_role.api_gateway_role.arn
}

# Route for /track endpoint
resource "aws_apigatewayv2_route" "track_route" {
  api_id    = aws_apigatewayv2_api.analytics_api.id
  route_key = "POST /track"
  target    = "integrations/${aws_apigatewayv2_integration.track_integration.id}"
  operation_name = "track"
}

# Route for /analytics endpoint
resource "aws_apigatewayv2_route" "analytics_route" {
  api_id    = aws_apigatewayv2_api.analytics_api.id
  route_key = "GET /analytics"
  target    = "integrations/${aws_apigatewayv2_integration.analytics_integration.id}"
  operation_name = "analytics"
}

# Stage
resource "aws_apigatewayv2_stage" "analytics_stage" {
  api_id      = aws_apigatewayv2_api.analytics_api.id
  name        = var.environment
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.analytics_api_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      resourcePath   = "$context.resourcePath"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      integrationLatency = "$context.integration.latency"
    })
  }

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_cloudwatch_log_group" "analytics_api_logs" {
  name              = "/aws/apigateway/${var.project_name}-analytics-api"
  retention_in_days = 7

  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "track_api_permission" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.track_play_click.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.analytics_api.execution_arn}/*"
}

resource "aws_lambda_permission" "analytics_api_permission" {
  statement_id  = "AllowExecutionFromApiGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.get_analytics.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.analytics_api.execution_arn}/*"
}
