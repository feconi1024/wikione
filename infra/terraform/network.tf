data "aws_route53_zone" "public" {
  name         = "${local.zone_name}."
  private_zone = false
}

data "aws_caller_identity" "current" {}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
}

resource "aws_subnet" "public" {
  for_each = toset(var.availability_zones)

  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.value
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, index(var.availability_zones, each.value))
  map_public_ip_on_launch = false

  tags = { Name = "wikione-${var.environment}-public-${each.value}" }
}

resource "aws_subnet" "private" {
  for_each = toset(var.availability_zones)

  vpc_id            = aws_vpc.this.id
  availability_zone = each.value
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, index(var.availability_zones, each.value) + 16)

  tags = { Name = "wikione-${var.environment}-private-${each.value}" }
}

resource "aws_eip" "nat" {
  for_each = toset(var.availability_zones)
  domain   = "vpc"
}

resource "aws_nat_gateway" "this" {
  for_each = toset(var.availability_zones)

  allocation_id = aws_eip.nat[each.value].id
  subnet_id     = aws_subnet.public[each.value].id

  depends_on = [aws_internet_gateway.this]
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
}

resource "aws_route_table_association" "public" {
  for_each       = toset(var.availability_zones)
  subnet_id      = aws_subnet.public[each.value].id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  for_each = toset(var.availability_zones)
  vpc_id   = aws_vpc.this.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this[each.value].id
  }
}

resource "aws_route_table_association" "private" {
  for_each       = toset(var.availability_zones)
  subnet_id      = aws_subnet.private[each.value].id
  route_table_id = aws_route_table.private[each.value].id
}

resource "aws_security_group" "alb" {
  name        = "wikione-${var.environment}-alb"
  description = "Public TLS entry point only"
  vpc_id      = aws_vpc.this.id

  ingress {
    description = "HTTP is redirected to HTTPS"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS public entry"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

}

resource "aws_security_group" "tasks" {
  for_each = {
    web     = 8080
    api     = 3000
    preview = 4174
  }

  name        = "wikione-${var.environment}-${each.key}-task"
  description = "${each.key} task receives its service port only from the ALB"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = each.value
    to_port         = each.value
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

}

resource "aws_vpc_security_group_egress_rule" "alb_to_task" {
  for_each = {
    web     = 8080
    api     = 3000
    preview = 4174
  }

  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.tasks[each.key].id
  ip_protocol                  = "tcp"
  from_port                    = each.value
  to_port                      = each.value
  description                  = "ALB to ${each.key} task only"
}

#trivy:ignore:AWS-0104 -- Fargate image pulls, AWS control-plane endpoints, and allowlisted MediaWiki APIs use changing public IPs; outbound traffic is restricted to TLS port 443.
resource "aws_vpc_security_group_egress_rule" "task_https" {
  for_each = aws_security_group.tasks

  security_group_id = each.value.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "TLS-only AWS, GHCR, and supported MediaWiki access"
}

resource "aws_security_group" "database" {
  name        = "wikione-${var.environment}-postgres"
  description = "PostgreSQL accepts connections from Fargate tasks only"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.tasks["api"].id]
  }
}

resource "aws_security_group" "redis" {
  name        = "wikione-${var.environment}-redis"
  description = "ElastiCache accepts TLS Redis connections from Fargate tasks only"
  vpc_id      = aws_vpc.this.id

  ingress {
    from_port = 6379
    to_port   = 6379
    protocol  = "tcp"
    security_groups = [
      aws_security_group.tasks["api"].id,
      aws_security_group.tasks["preview"].id,
    ]
  }
}

resource "aws_vpc_security_group_egress_rule" "api_postgres" {
  security_group_id            = aws_security_group.tasks["api"].id
  referenced_security_group_id = aws_security_group.database.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "API to private PostgreSQL only"
}

resource "aws_vpc_security_group_egress_rule" "service_redis" {
  for_each = toset(["api", "preview"])

  security_group_id            = aws_security_group.tasks[each.value].id
  referenced_security_group_id = aws_security_group.redis.id
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
  description                  = "${each.value} to private TLS Redis only"
}
