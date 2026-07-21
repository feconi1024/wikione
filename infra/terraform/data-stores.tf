resource "aws_db_subnet_group" "postgres" {
  name       = "wikione-${var.environment}-postgres"
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]
}

resource "aws_db_instance" "postgres" {
  identifier                      = "wikione-${var.environment}-postgres"
  engine                          = "postgres"
  engine_version                  = "17"
  instance_class                  = var.db_instance_class
  allocated_storage               = 30
  max_allocated_storage           = 100
  storage_type                    = "gp3"
  storage_encrypted               = true
  db_name                         = "wikione"
  username                        = "wikione"
  manage_master_user_password     = true
  multi_az                        = true
  publicly_accessible             = false
  deletion_protection             = true
  backup_retention_period         = var.db_backup_retention_days
  copy_tags_to_snapshot           = true
  skip_final_snapshot             = false
  final_snapshot_identifier       = "wikione-${var.environment}-postgres-final"
  auto_minor_version_upgrade      = true
  backup_window                   = "03:00-03:30"
  maintenance_window              = "sun:04:00-sun:04:30"
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  db_subnet_group_name   = aws_db_subnet_group.postgres.name
  vpc_security_group_ids = [aws_security_group.database.id]
}

resource "aws_elasticache_subnet_group" "redis" {
  name       = "wikione-${var.environment}-redis"
  subnet_ids = [for subnet in aws_subnet.private : subnet.id]
}

resource "aws_elasticache_user" "service" {
  for_each = {
    api     = "on ~wikione:auth:* ~wikione:preview:* ~wikione:rate-limit:* +@all -@dangerous"
    preview = "on ~wikione:preview:* +get +ping +@connection"
  }

  user_id       = "wikione-${var.environment}-${each.key}"
  user_name     = "wikione-${var.environment}-${each.key}"
  engine        = "redis"
  access_string = each.value

  # IAM authentication avoids placing a Redis password in Terraform state.
  authentication_mode {
    type = "iam"
  }
}

resource "aws_elasticache_user" "default" {
  user_id              = "default"
  user_name            = "default"
  engine               = "redis"
  access_string        = "off -@all"
  no_password_required = true
}

resource "aws_elasticache_user_group" "service" {
  engine        = "redis"
  user_group_id = "wikione-${var.environment}-services"
  # ElastiCache requires the disabled default user in every user group.
  user_ids = [
    aws_elasticache_user.default.user_id,
    aws_elasticache_user.service["api"].user_id,
    aws_elasticache_user.service["preview"].user_id,
  ]
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "wikione-${var.environment}-redis"
  description                = "Ephemeral encrypted sessions and isolated-preview bundles; no browser drafts or durable data"
  engine                     = "redis"
  engine_version             = "7.1"
  node_type                  = "cache.t4g.small"
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis.id]
  user_group_ids             = [aws_elasticache_user_group.service.user_group_id]
  automatic_failover_enabled = true
  multi_az_enabled           = true
  num_cache_clusters         = 2
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  # Preview bundles are deliberately ephemeral: no snapshots, no persistence,
  # and no browser drafts are ever written to this service.
  snapshot_retention_limit = 0
  snapshot_window          = "05:00-05:30"
  apply_immediately        = false
  maintenance_window       = "sun:06:00-sun:06:30"
}
