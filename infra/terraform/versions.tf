terraform {
  required_version = ">= 1.15.0, < 1.16.0"

  required_providers {
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7.1"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.53.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.tags, {
      Application = "wikione"
      ManagedBy   = "terraform"
      Environment = var.environment
    })
  }
}
