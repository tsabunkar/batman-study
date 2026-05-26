output "s3_bucket_name" {
  description = "Name of the S3 bucket hosting the website"
  value       = aws_s3_bucket.website.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.website.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID (used for cache invalidation)"
  value       = aws_cloudfront_distribution.website.id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain name — your live website URL"
  value       = "https://${aws_cloudfront_distribution.website.domain_name}"
}

output "analytics_api_endpoint" {
  description = "API Gateway endpoint for analytics tracking"
  value       = aws_apigatewayv2_stage.analytics_stage.invoke_url
}

output "dynamodb_table_name" {
  description = "DynamoDB table name for storing analytics"
  value       = aws_dynamodb_table.play_analytics.name
}

output "dynamodb_table_arn" {
  description = "DynamoDB table ARN"
  value       = aws_dynamodb_table.play_analytics.arn
}
