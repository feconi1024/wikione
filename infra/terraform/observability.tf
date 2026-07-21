resource "aws_sns_topic" "alerts" {
  name              = "wikione-${var.environment}-alerts"
  kms_master_key_id = aws_kms_key.operational.arn
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid     = "AccountOwnerAdministration"
    actions = ["SNS:*"]
    resources = [
      aws_sns_topic.alerts.arn,
    ]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid       = "EcsFailureEvents"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["events.amazonaws.com"]
    }
    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_cloudwatch_event_rule.ecs_task_failure.arn]
    }
  }

  statement {
    sid       = "RdsOperationalEvents"
    actions   = ["SNS:Publish"]
    resources = [aws_sns_topic.alerts.arn]
    principals {
      type        = "Service"
      identifiers = ["events.rds.amazonaws.com"]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_cloudwatch_log_metric_filter" "api_5xx" {
  name           = "wikione-${var.environment}-api-5xx"
  log_group_name = aws_cloudwatch_log_group.service["api"].name
  pattern        = "{ $.event = \"request-complete\" && $.statusCode >= 500 }"

  metric_transformation {
    name          = "Api5xx"
    namespace     = "WikiOne/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "preview_5xx" {
  name           = "wikione-${var.environment}-preview-5xx"
  log_group_name = aws_cloudwatch_log_group.service["preview"].name
  pattern        = "{ $.event = \"request-complete\" && $.statusCode >= 500 }"

  metric_transformation {
    name          = "Preview5xx"
    namespace     = "WikiOne/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "auth_rejections" {
  name           = "wikione-${var.environment}-auth-rejections"
  log_group_name = aws_cloudwatch_log_group.service["api"].name
  pattern        = "{ $.event = \"request-complete\" && $.route = \"/v1/auth/*\" && $.statusCode >= 400 }"

  metric_transformation {
    name          = "AuthRejections"
    namespace     = "WikiOne/${var.environment}"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_targets" {
  for_each = aws_lb_target_group.service

  alarm_name          = "wikione-${var.environment}-${each.key}-unhealthy"
  alarm_description   = "At least one ${each.key} target failed its deployment health check."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.this.arn_suffix
    TargetGroup  = each.value.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "wikione-${var.environment}-api-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = aws_cloudwatch_log_metric_filter.api_5xx.metric_transformation[0].name
  namespace           = "WikiOne/${var.environment}"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "preview_5xx" {
  alarm_name          = "wikione-${var.environment}-preview-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = aws_cloudwatch_log_metric_filter.preview_5xx.metric_transformation[0].name
  namespace           = "WikiOne/${var.environment}"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "target_latency" {
  for_each = aws_lb_target_group.service

  alarm_name          = "wikione-${var.environment}-${each.key}-p95-latency"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "TargetResponseTime"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  extended_statistic  = "p95"
  threshold           = each.key == "web" ? 1 : 1.5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.this.arn_suffix
    TargetGroup  = each.value.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  for_each = aws_lb_target_group.service

  alarm_name          = "wikione-${var.environment}-${each.key}-target-5xx"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "HTTPCode_Target_5XX_Count"
  namespace           = "AWS/ApplicationELB"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    LoadBalancer = aws_lb.this.arn_suffix
    TargetGroup  = each.value.arn_suffix
  }
}

resource "aws_cloudwatch_metric_alarm" "auth_rejections" {
  alarm_name          = "wikione-${var.environment}-auth-rejections"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = aws_cloudwatch_log_metric_filter.auth_rejections.metric_transformation[0].name
  namespace           = "WikiOne/${var.environment}"
  period              = 300
  statistic           = "Sum"
  threshold           = 50
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

resource "aws_cloudwatch_metric_alarm" "running_tasks" {
  for_each = aws_ecs_service.service

  alarm_name          = "wikione-${var.environment}-${each.key}-task-count"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "RunningTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 60
  statistic           = "Minimum"
  threshold           = var.desired_count
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.this.name
    ServiceName = each.value.name
  }
}

resource "aws_cloudwatch_metric_alarm" "certificate_expiry" {
  alarm_name          = "wikione-${var.environment}-certificate-expiry"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 1
  metric_name         = "DaysToExpiry"
  namespace           = "AWS/CertificateManager"
  period              = 86400
  statistic           = "Minimum"
  threshold           = 21
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = { CertificateArn = aws_acm_certificate.public.arn }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "wikione-${var.environment}-rds-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = { DBInstanceIdentifier = aws_db_instance.postgres.identifier }
}

resource "aws_cloudwatch_metric_alarm" "redis_cpu" {
  alarm_name          = "wikione-${var.environment}-redis-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "EngineCPUUtilization"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = { ReplicationGroupId = aws_elasticache_replication_group.redis.replication_group_id }
}

resource "aws_db_event_subscription" "operational" {
  name             = "wikione-${var.environment}-postgres-events"
  sns_topic        = aws_sns_topic.alerts.arn
  source_type      = "db-instance"
  source_ids       = [aws_db_instance.postgres.identifier]
  event_categories = ["backup", "failure", "maintenance", "recovery"]

  depends_on = [aws_sns_topic_policy.alerts]
}

resource "aws_cloudwatch_event_rule" "ecs_task_failure" {
  name        = "wikione-${var.environment}-ecs-task-failure"
  description = "Essential WikiOne tasks that stop unexpectedly."
  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Task State Change"]
    detail = {
      clusterArn = [aws_ecs_cluster.this.arn]
      lastStatus = ["STOPPED"]
      stopCode   = ["TaskFailedToStart", "EssentialContainerExited"]
    }
  })
}

resource "aws_cloudwatch_event_target" "ecs_task_failure" {
  rule = aws_cloudwatch_event_rule.ecs_task_failure.name
  arn  = aws_sns_topic.alerts.arn

  depends_on = [aws_sns_topic_policy.alerts]
}

resource "aws_cloudwatch_dashboard" "operations" {
  dashboard_name = "wikione-${var.environment}-operations"
  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          title  = "ALB target health"
          region = var.aws_region
          period = 300
          metrics = [for name, target_group in aws_lb_target_group.service :
            ["AWS/ApplicationELB", "UnHealthyHostCount", "LoadBalancer", aws_lb.this.arn_suffix, "TargetGroup", target_group.arn_suffix, { label = "${name} unhealthy", stat = "Maximum" }]
          ]
        }
      },
      {
        type = "metric"
        properties = {
          title  = "ALB p95 latency and target 5xx"
          region = var.aws_region
          period = 300
          metrics = concat(
            [for name, target_group in aws_lb_target_group.service :
              ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", aws_lb.this.arn_suffix, "TargetGroup", target_group.arn_suffix, { label = "${name} p95", stat = "p95", yAxis = "left" }]
            ],
            [for name, target_group in aws_lb_target_group.service :
              ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", aws_lb.this.arn_suffix, "TargetGroup", target_group.arn_suffix, { label = "${name} 5xx", stat = "Sum", yAxis = "right" }]
            ],
          )
        }
      },
      {
        type = "metric"
        properties = {
          title  = "ECS running tasks"
          region = var.aws_region
          period = 60
          metrics = [for name, service in aws_ecs_service.service :
            ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", aws_ecs_cluster.this.name, "ServiceName", service.name, { label = name, stat = "Minimum" }]
          ]
        }
      },
      {
        type = "metric"
        properties = {
          title  = "Data stores"
          region = var.aws_region
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.postgres.identifier, { label = "PostgreSQL CPU" }],
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.postgres.identifier, { label = "PostgreSQL connections" }],
            ["AWS/ElastiCache", "EngineCPUUtilization", "ReplicationGroupId", aws_elasticache_replication_group.redis.replication_group_id, { label = "Redis CPU" }],
            ["AWS/ElastiCache", "CurrConnections", "ReplicationGroupId", aws_elasticache_replication_group.redis.replication_group_id, { label = "Redis connections" }]
          ]
        }
      },
      {
        type = "metric"
        properties = {
          title  = "Application 5xx logs"
          region = var.aws_region
          metrics = [
            ["WikiOne/${var.environment}", "Api5xx"],
            [".", "Preview5xx"],
            [".", "AuthRejections"]
          ]
        }
      },
      {
        type = "metric"
        properties = {
          title  = "Synthetic readiness"
          region = var.aws_region
          period = 300
          metrics = [
            ["CloudWatchSynthetics", "SuccessPercent", "CanaryName", aws_synthetics_canary.readyz.name, { stat = "Average" }]
          ]
        }
      }
    ]
  })
}

resource "aws_iam_role" "synthetics" {
  name = "wikione-${var.environment}-synthetics"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "synthetics.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

data "aws_iam_policy_document" "synthetics" {
  statement {
    sid       = "WriteOnlyCanaryArtifacts"
    actions   = ["s3:GetBucketLocation", "s3:GetBucketEncryption", "s3:PutObject"]
    resources = [aws_s3_bucket.synthetics.arn, "${aws_s3_bucket.synthetics.arn}/*"]
  }

  statement {
    sid       = "EncryptCanaryArtifacts"
    actions   = ["kms:Decrypt", "kms:GenerateDataKey"]
    resources = [aws_kms_key.operational.arn]
  }

  statement {
    sid       = "WriteCanaryLogs"
    actions   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/cwsyn-*"]
  }

  statement {
    sid       = "PublishCanaryMetrics"
    actions   = ["cloudwatch:PutMetricData"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "cloudwatch:namespace"
      values   = ["CloudWatchSynthetics"]
    }
  }
}

resource "aws_iam_role_policy" "synthetics" {
  name   = "write-canary-observability"
  role   = aws_iam_role.synthetics.id
  policy = data.aws_iam_policy_document.synthetics.json
}

data "archive_file" "readyz_canary" {
  type        = "zip"
  source_file = "${path.module}/canary/index.js"
  output_path = "${path.module}/.terraform/wikione-readyz-canary.zip"
}

resource "aws_synthetics_canary" "readyz" {
  name                     = "wko-${substr(replace(var.environment, "-", ""), 0, 10)}-hz"
  artifact_s3_location     = "s3://${aws_s3_bucket.synthetics.bucket}/"
  execution_role_arn       = aws_iam_role.synthetics.arn
  handler                  = "index.handler"
  runtime_version          = var.synthetics_runtime_version
  start_canary             = true
  zip_file                 = data.archive_file.readyz_canary.output_path
  success_retention_period = 30
  failure_retention_period = 30

  schedule {
    expression = "rate(5 minutes)"
  }

  run_config {
    timeout_in_seconds = 60
    environment_variables = {
      WIKIONE_HEALTH_ENDPOINTS = join(",", [
        "https://${local.app_domain}/healthz",
        "https://${local.api_domain}/readyz",
        "https://${local.preview_domain}/readyz",
      ])
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "synthetic_success" {
  alarm_name          = "wikione-${var.environment}-synthetic-success"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "SuccessPercent"
  namespace           = "CloudWatchSynthetics"
  period              = 300
  statistic           = "Average"
  threshold           = 100
  treat_missing_data  = "breaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = { CanaryName = aws_synthetics_canary.readyz.name }
}
