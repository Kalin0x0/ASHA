#!/usr/bin/env bash
# Build a Asha trusted-workstation image from a base Kasm/Neko image, baking
# every certs/*.crt into the OS trust store and enabling Firefox enterprise roots.
#
#   ./build.sh [BASE_IMAGE] [TARGET_TAG] [ENABLE_DLP]
# e.g.
#   ./build.sh kasmweb/firefox:1.16.0 asha/firefox-trusted:1.16.0 1
set -euo pipefail
BASE="${1:-kasmweb/firefox:1.16.0}"
TAG="${2:-asha/$(basename "${BASE%%:*}")-trusted:${BASE##*:}}"
DLP="${3:-1}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo ">> Building ${TAG}  (base=${BASE}, DLP=${DLP})"
docker build \
  -f "${DIR}/Dockerfile" \
  --build-arg BASE_IMAGE="${BASE}" \
  --build-arg ENABLE_DLP="${DLP}" \
  -t "${TAG}" \
  "${DIR}"
echo ">> Done: ${TAG}"
echo ">> Point a workspace's image at ${TAG} to give its sessions the internal CA."
