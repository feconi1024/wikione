#!/bin/sh
set -eu

validate_origin() {
    name="$1"
    value="$2"
    if printf '%s\n' "$value" | grep -Eq '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$'; then
        return
    fi
    if [ "${ALLOW_INSECURE_LOOPBACK_ORIGINS:-false}" = 'true' ] \
        && printf '%s\n' "$value" | grep -Eq '^http://(127\.0\.0\.1|localhost)(:[0-9]{1,5})?$'; then
        return
    fi

    printf '%s must be an exact HTTPS DNS origin; HTTP loopback requires an explicit local-only opt-in.\n' "$name" >&2
    exit 1
}

validate_origin API_ORIGIN "$API_ORIGIN"
validate_origin PREVIEW_ORIGIN "$PREVIEW_ORIGIN"

umask 077
printf 'globalThis.__WIKIONE_RUNTIME_CONFIG__=Object.freeze({apiBaseUrl:"%s"});\n' \
    "$API_ORIGIN" > /tmp/wikione-runtime-config.js
