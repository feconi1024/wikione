output "app_url" {
  value       = "https://${local.app_domain}"
  description = "Public editor endpoint."
}

output "api_url" {
  value       = "https://${local.api_domain}"
  description = "Public API endpoint."
}

output "preview_url" {
  value       = "https://${local.preview_domain}"
  description = "Public isolated-preview endpoint."
}

output "config_backup_bucket" {
  value       = aws_s3_bucket.config_backup.bucket
  description = "Versioned bucket for Terraform plans, release manifests, and configuration backups only."
}

output "postgres_master_secret_arn" {
  value       = aws_db_instance.postgres.master_user_secret[0].secret_arn
  description = "RDS-managed secret ARN; its value is intentionally not an output."
  sensitive   = true
}

output "redis_endpoint" {
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  description = "TLS Redis endpoint used with task-role IAM authentication; no password is emitted."
}
