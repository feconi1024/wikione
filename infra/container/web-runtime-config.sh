#!/bin/sh
set -eu

validate_origin() {
    name="$1"
    value="$2"
    if ! printf '%s\n' "$value" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
        printf '%s must be an exact HTTPS origin with a DNS hostname.\n' "$name" >&2
        exit 1
    fi
}

validate_origin API_ORIGIN "$API_ORIGIN"
validate_origin PREVIEW_ORIGIN "$PREVIEW_ORIGIN"

umask 077
printf 'globalThis.__WIKIONE_RUNTIME_CONFIG__=Object.freeze({apiBaseUrl:"%s"});\n' \
    "$API_ORIGIN" > /tmp/wikione-runtime-config.js
