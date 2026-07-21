resource "aws_ecs_cluster" "this" {
  name = "wikione-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enhanced"
  }
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.service_definitions
  name              = "/wikione/${var.environment}/${each.key}"
  retention_in_days = 30
}

data "aws_iam_policy_document" "task_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "wikione-${var.environment}-task-execution"
  assume_role_policy = data.aws_iam_policy_document.task_assume_role.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "execution_secrets" {
  statement {
    sid     = "ReadOnlyReferencedRuntimeSecrets"
    actions = ["secretsmanager:GetSecretValue"]
    resources = distinct(concat(
      values(var.api_secret_arns),
      values(var.preview_secret_arns),
      [aws_db_instance.postgres.master_user_secret[0].secret_arn],
    ))
  }
}

resource "aws_iam_role_policy" "execution_secrets" {
  name   = "referenced-runtime-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution_secrets.json
}

resource "aws_iam_role" "task" {
  for_each           = local.service_definitions
  name               = "wikione-${var.environment}-${each.key}-task"
  assume_role_policy = data.aws_iam_policy_document.task_assume_role.json
}

data "aws_iam_policy_document" "task_redis" {
  for_each = toset(["api", "preview"])

  statement {
    sid     = "ConnectToEphemeralRedisOnly"
    actions = ["elasticache:Connect"]
    resources = [
      aws_elasticache_replication_group.redis.arn,
      aws_elasticache_user.service[each.value].arn,
    ]
  }
}

resource "aws_iam_role_policy" "task_redis" {
  for_each = toset(["api", "preview"])
  name     = "connect-ephemeral-redis"
  role     = aws_iam_role.task[each.value].id
  policy   = data.aws_iam_policy_document.task_redis[each.value].json
}

resource "aws_ecs_task_definition" "service" {
  for_each = local.service_definitions

  family                   = "wikione-${var.environment}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.task_cpu)
  memory                   = tostring(var.task_memory)
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task[each.key].arn

  container_definitions = jsonencode([{
    name      = each.key
    image     = each.value.image
    essential = true
    portMappings = [{
      containerPort = each.value.port
      hostPort      = each.value.port
      protocol      = "tcp"
    }]
    environment = [for name, value in each.value.environment : { name = name, value = value }]
    secrets     = [for name, value_from in each.value.secrets : { name = name, valueFrom = value_from }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
    linuxParameters = {
      initProcessEnabled = true
    }
    readonlyRootFilesystem = true
    mountPoints = concat(
      [{ sourceVolume = "runtime-tmp", containerPath = "/tmp", readOnly = false }],
      each.key == "web" ? [{ sourceVolume = "nginx-config", containerPath = "/etc/nginx/conf.d", readOnly = false }] : []
    )
    healthCheck = {
      command     = each.value.health_command
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])

  volume {
    name = "runtime-tmp"
  }

  dynamic "volume" {
    for_each = each.key == "web" ? [1] : []
    content {
      name = "nginx-config"
    }
  }
}

#trivy:ignore:AWS-0053 -- WikiOne is a public web application; tasks and data stores remain private and only this TLS entry point is internet-facing.
resource "aws_lb" "this" {
  name                       = "wikione-${var.environment}"
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = [for subnet in aws_subnet.public : subnet.id]
  drop_invalid_header_fields = true
  enable_deletion_protection = true
}

resource "aws_lb_target_group" "service" {
  for_each    = local.service_definitions
  name        = "wko-${substr(var.environment, 0, 8)}-${each.key}"
  port        = each.value.port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.this.id

  health_check {
    enabled             = true
    path                = each.value.health_path
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_acm_certificate" "public" {
  domain_name               = local.app_domain
  subject_alternative_names = [local.api_domain, local.preview_domain]
  validation_method         = "DNS"
}

resource "aws_route53_record" "certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.public.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.public.zone_id
  name    = each.value.name
  type    = each.value.type
  ttl     = 60
  records = [each.value.record]
}

resource "aws_acm_certificate_validation" "public" {
  certificate_arn         = aws_acm_certificate.public.arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

#trivy:ignore:AWS-0054 -- Port 80 exposes no application content: exact known hosts receive an HTTPS redirect and every other host receives a fixed 404.
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Unknown host"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "http_redirect" {
  for_each = {
    app     = local.app_domain
    api     = local.api_domain
    preview = local.preview_domain
  }

  listener_arn = aws_lb_listener.http.arn
  priority     = index(["app", "api", "preview"], each.key) + 1

  action {
    type = "redirect"

    redirect {
      host        = "#{host}"
      path        = "/#{path}"
      port        = "443"
      protocol    = "HTTPS"
      query       = "#{query}"
      status_code = "HTTP_301"
    }
  }

  condition {
    host_header { values = [each.value] }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.public.certificate_arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "text/plain"
      message_body = "Unknown host"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "web" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 5

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["web"].arn
  }

  condition {
    host_header { values = [local.app_domain] }
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 10
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["api"].arn
  }
  condition {
    host_header { values = [local.api_domain] }
  }
}

resource "aws_lb_listener_rule" "preview" {
  listener_arn = aws_lb_listener.https.arn
  priority     = 20
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service["preview"].arn
  }
  condition {
    host_header { values = [local.preview_domain] }
  }
}

resource "aws_ecs_service" "service" {
  for_each = local.service_definitions

  name                              = each.key
  cluster                           = aws_ecs_cluster.this.id
  task_definition                   = aws_ecs_task_definition.service[each.key].arn
  desired_count                     = var.desired_count
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 90
  wait_for_steady_state             = true
  enable_execute_command            = false

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  network_configuration {
    assign_public_ip = false
    security_groups  = [aws_security_group.tasks[each.key].id]
    subnets          = [for subnet in aws_subnet.private : subnet.id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.service[each.key].arn
    container_name   = each.key
    container_port   = each.value.port
  }

  depends_on = [aws_lb_listener.https]
}

resource "aws_route53_record" "service" {
  for_each = {
    app     = local.app_domain
    api     = local.api_domain
    preview = local.preview_domain
  }

  zone_id = data.aws_route53_zone.public.zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
