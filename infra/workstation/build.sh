#!/usr/bin/env bash
# Build a Asha trusted-workstation image from a base Kasm/Neko image, baking
# operator-approved certs/*.crt into the OS trust store only when opted in.
#
#   ./build.sh [BASE_IMAGE] [TARGET_TAG] [ENABLE_DLP] [INSTALL_CUSTOM_CAS]
# e.g.
#   ./build.sh kasmweb/firefox:1.16.0 asha/firefox-trusted:1.16.0 1
set -euo pipefail
BASE="${1:-kasmweb/firefox:1.16.0}"
TAG="${2:-asha/$(basename "${BASE%%:*}")-trusted:${BASE##*:}}"
DLP="${3:-1}"
CUSTOM_CAS="${4:-0}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo ">> Building ${TAG}  (base=${BASE}, DLP=${DLP})"
docker build \
  -f "${DIR}/Dockerfile" \
  --build-arg BASE_IMAGE="${BASE}" \
  --build-arg ENABLE_DLP="${DLP}" \
  --build-arg INSTALL_CUSTOM_CAS="${CUSTOM_CAS}" \
  -t "${TAG}" \
  "${DIR}"
echo ">> Done: ${TAG}"
echo ">> Custom CA installation: ${CUSTOM_CAS} (0 = disabled, 1 = enabled)."
