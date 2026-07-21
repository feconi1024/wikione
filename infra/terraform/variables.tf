variable "aws_region" {
  type        = string
  description = "AWS region for this isolated environment."
}

variable "environment" {
  type        = string
  description = "Short environment name, for example staging or production."
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}$", var.environment))
    error_message = "environment must be a lowercase DNS-safe identifier."
  }
}

variable "route53_zone_name" {
  type        = string
  description = "Existing public Route53 zone, without a trailing dot (for example example.org)."
}

variable "app_subdomain" {
  type        = string
  description = "Exact application hostname label (for example app)."
  default     = "app"
}

variable "api_subdomain" {
  type        = string
  description = "Exact API hostname label (for example api)."
  default     = "api"
}

variable "preview_subdomain" {
  type        = string
  description = "Exact isolated-preview hostname label (for example preview)."
  default     = "preview"
}

variable "vpc_cidr" {
  type        = string
  description = "Non-overlapping RFC1918 CIDR for this environment."
  default     = "10.42.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "Two or three AZs in aws_region. Two are required for HA managed services."
  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least two availability zones are required."
  }
}

variable "container_image_digests" {
  type = object({
    web     = string
    api     = string
    preview = string
  })
  description = "Public GHCR OCI references from the signed release manifest, each pinned with @sha256:<digest>. Tags and other registries are rejected."
  validation {
    condition = alltrue([
      for image in values(var.container_image_digests) : can(regex("^ghcr\\.io/[a-z0-9._-]+/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$", image))
    ])
    error_message = "Every container image must be a public immutable ghcr.io/...@sha256 digest reference."
  }
}

variable "api_secret_arns" {
  type        = map(string)
  description = "ARNs of pre-created Secrets Manager secrets containing complete values. Terraform never reads secret values. Required: SESSION_ENCRYPTION_KEY_BASE64 and SESSION_LOOKUP_HMAC_KEY_BASE64. The write-only application database credential is managed separately."
  sensitive   = true
  validation {
    condition = alltrue([
      for key in ["SESSION_ENCRYPTION_KEY_BASE64", "SESSION_LOOKUP_HMAC_KEY_BASE64"] : contains(keys(var.api_secret_arns), key)
    ])
    error_message = "api_secret_arns must include all required API secret names."
  }
}

variable "preview_secret_arns" {
  type        = map(string)
  description = "Optional ARNs of pre-created preview-service secrets. Redis uses endpoint metadata and task-role IAM auth, not a stored password."
  sensitive   = true
  default     = {}
}

variable "db_instance_class" {
  type        = string
  description = "RDS PostgreSQL instance class."
  default     = "db.t4g.medium"
}

variable "database_application_secret_version" {
  type        = number
  description = "Positive rotation generation for the write-only API database password. Increment through a reviewed plan to rotate and redeploy API tasks."
  default     = 1
  validation {
    condition     = var.database_application_secret_version >= 1 && floor(var.database_application_secret_version) == var.database_application_secret_version
    error_message = "database_application_secret_version must be a positive integer."
  }
}

variable "db_backup_retention_days" {
  type        = number
  description = "RDS automated backup retention; production must be at least seven days."
  default     = 14
  validation {
    condition     = var.db_backup_retention_days >= 7 && var.db_backup_retention_days <= 35
    error_message = "Keep PostgreSQL backups for 7–35 days."
  }
}

variable "task_cpu" {
  type        = number
  description = "Fargate CPU units for each service."
  default     = 512
}

variable "task_memory" {
  type        = number
  description = "Fargate memory MiB for each service."
  default     = 1024
}

variable "desired_count" {
  type        = number
  description = "Desired Fargate task count per service. Production should use at least two."
  default     = 2
  validation {
    condition     = var.desired_count >= 1
    error_message = "desired_count must be positive."
  }
}

variable "alert_email" {
  type        = string
  description = "Operational email address subscribed to the SNS alarm topic."
}

variable "synthetics_runtime_version" {
  type        = string
  description = "Region-supported CloudWatch Synthetics Node.js runtime. Review against AWS support policy during upgrades."
  default     = "syn-nodejs-5.1"
  validation {
    condition     = can(regex("^syn-nodejs-[0-9]+\\.[0-9]+$", var.synthetics_runtime_version))
    error_message = "Use a stable syn-nodejs-<major>.<minor> runtime identifier."
  }
}

variable "tags" {
  type        = map(string)
  description = "Additional mandatory organizational tags."
  default     = {}
}
