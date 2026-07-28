variable "REGISTRY" {
    default = "ghcr.io"
}

variable "IMAGE_NAMESPACE" {
    default = "feconi1024/wikione"
}

variable "VERSION" {
    default = "0.0.0-dev"
}

variable "VCS_REF" {
    default = "unknown"
}

variable "PLATFORMS" {
    default = "linux/amd64,linux/arm64"
}

group "default" {
    targets = ["api", "preview", "web"]
}

target "common" {
    context    = "."
    dockerfile = "Dockerfile"
    platforms  = split(",", PLATFORMS)
    args = {
        VERSION = VERSION
        VCS_REF = VCS_REF
    }
    labels = {
        "org.opencontainers.image.source"   = "https://github.com/feconi1024/wikione"
        "org.opencontainers.image.revision" = VCS_REF
        "org.opencontainers.image.version"  = VERSION
        "org.opencontainers.image.licenses" = "MIT"
    }
}

target "api" {
    inherits = ["common"]
    target   = "api"
    tags     = ["${REGISTRY}/${IMAGE_NAMESPACE}-api:${VERSION}"]
}

target "preview" {
    inherits = ["common"]
    target   = "preview"
    tags     = ["${REGISTRY}/${IMAGE_NAMESPACE}-preview:${VERSION}"]
}

target "web" {
    inherits = ["common"]
    target   = "web"
    tags     = ["${REGISTRY}/${IMAGE_NAMESPACE}-web:${VERSION}"]
}

# This target intentionally stays single-platform: `--load` is required by the
# local reproducibility and smoke scripts, and Docker's local image store cannot
# load a multi-platform manifest.
target "local" {
    inherits  = ["common"]
    platforms = ["linux/amd64"]
}
