locals {
  zone_name      = trimsuffix(var.route53_zone_name, ".")
  app_domain     = "${var.app_subdomain}.${local.zone_name}"
  api_domain     = "${var.api_subdomain}.${local.zone_name}"
  preview_domain = "${var.preview_subdomain}.${local.zone_name}"

  service_definitions = {
    web = {
      image          = var.container_image_digests.web
      port           = 8080
      health_path    = "/healthz"
      health_command = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/livez || exit 1"]
      environment = {
        # Nginx renders its CSP template from these runtime values.
        API_ORIGIN     = "https://${local.api_domain}"
        PREVIEW_ORIGIN = "https://${local.preview_domain}"
      }
      secrets = {}
    }
    api = {
      image          = var.container_image_digests.api
      port           = 3000
      health_path    = "/readyz"
      health_command = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:3000/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      environment = {
        AWS_REGION               = var.aws_region
        API_HOST                 = "0.0.0.0"
        API_PORT                 = "3000"
        COOKIE_SECURE            = "true"
        DATABASE_HOST            = aws_db_instance.postgres.address
        DATABASE_NAME            = aws_db_instance.postgres.db_name
        DATABASE_PORT            = tostring(aws_db_instance.postgres.port)
        DATABASE_USER            = aws_db_instance.postgres.username
        EDITOR_ORIGINS           = "https://${local.app_domain}"
        NODE_ENV                 = "production"
        PREVIEW_BASE_URL         = "https://${local.preview_domain}"
        PREVIEW_TTL_MILLISECONDS = "120000"
        REDIS_IAM_CACHE_NAME     = aws_elasticache_replication_group.redis.replication_group_id
        REDIS_IAM_USER_ID        = aws_elasticache_user.service["api"].user_id
        REDIS_URL                = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
        SESSION_KEY_ID           = var.environment
        TRUST_PROXY_HOPS         = "1"
        MEDIAWIKI_USER_AGENT     = "WikiOne/1.0 (https://${local.app_domain}; ${var.alert_email})"
      }
      secrets = merge(var.api_secret_arns, {
        DATABASE_PASSWORD = "${aws_db_instance.postgres.master_user_secret[0].secret_arn}:password::"
      })
    }
    preview = {
      image          = var.container_image_digests.preview
      port           = 4174
      health_path    = "/readyz"
      health_command = ["CMD-SHELL", "node -e \"fetch('http://127.0.0.1:4174/livez').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""]
      environment = {
        AWS_REGION           = var.aws_region
        EDITOR_ORIGINS       = "https://${local.app_domain}"
        NODE_ENV             = "production"
        PREVIEW_HOST         = "0.0.0.0"
        PREVIEW_PORT         = "4174"
        REDIS_IAM_CACHE_NAME = aws_elasticache_replication_group.redis.replication_group_id
        REDIS_IAM_USER_ID    = aws_elasticache_user.service["preview"].user_id
        REDIS_URL            = "rediss://${aws_elasticache_replication_group.redis.primary_endpoint_address}:6379"
        TRUST_PROXY_HOPS     = "1"
      }
      secrets = var.preview_secret_arns
    }
  }
}
