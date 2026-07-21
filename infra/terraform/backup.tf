data "aws_iam_policy_document" "operational_kms" {
  statement {
    sid       = "AccountAdministration"
    actions   = ["kms:*"]
    resources = ["*"]
    principals {
      type        = "AWS"
      identifiers = ["arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"]
    }
  }

  statement {
    sid = "OperationalServiceEncryption"
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey*",
    ]
    resources = ["*"]
    principals {
      type = "Service"
      identifiers = [
        "cloudwatch.amazonaws.com",
        "events.amazonaws.com",
        "events.rds.amazonaws.com",
        "sns.amazonaws.com",
      ]
    }
    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_kms_key" "operational" {
  description             = "WikiOne ${var.environment} configuration backups and operational alerts"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = data.aws_iam_policy_document.operational_kms.json
}

resource "aws_kms_alias" "operational" {
  name          = "alias/wikione-${var.environment}-operational"
  target_key_id = aws_kms_key.operational.key_id
}

resource "aws_s3_bucket" "config_backup" {
  bucket        = "wikione-${var.environment}-${data.aws_caller_identity.current.account_id}-config"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "config_backup" {
  bucket                  = aws_s3_bucket.config_backup.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "config_backup" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.config_backup.arn,
      "${aws_s3_bucket.config_backup.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "config_backup" {
  bucket = aws_s3_bucket.config_backup.id
  policy = data.aws_iam_policy_document.config_backup.json
}

resource "aws_s3_bucket_versioning" "config_backup" {
  bucket = aws_s3_bucket.config_backup.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "config_backup" {
  bucket = aws_s3_bucket.config_backup.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.operational.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "config_backup" {
  bucket = aws_s3_bucket.config_backup.id
  rule {
    id     = "retain-config-release-records"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 365 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}

# Synthetics output is operational telemetry, not configuration backup data.
resource "aws_s3_bucket" "synthetics" {
  bucket        = "wikione-${var.environment}-${data.aws_caller_identity.current.account_id}-synthetics"
  force_destroy = false
}

resource "aws_s3_bucket_public_access_block" "synthetics" {
  bucket                  = aws_s3_bucket.synthetics.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

data "aws_iam_policy_document" "synthetics_bucket" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.synthetics.arn,
      "${aws_s3_bucket.synthetics.arn}/*",
    ]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "synthetics" {
  bucket = aws_s3_bucket.synthetics.id
  policy = data.aws_iam_policy_document.synthetics_bucket.json
}

resource "aws_s3_bucket_server_side_encryption_configuration" "synthetics" {
  bucket = aws_s3_bucket.synthetics.id
  rule {
    bucket_key_enabled = true
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.operational.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "synthetics" {
  bucket = aws_s3_bucket.synthetics.id
  rule {
    id     = "expire-operational-artifacts"
    status = "Enabled"
    filter {}
    expiration { days = 30 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}
