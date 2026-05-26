variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "ap-south-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "batman-study"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "prod"
}
