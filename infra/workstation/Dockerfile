# Chista trusted-workstation image (F6 enabler).
# Bakes the deployment's internal CA(s) into the OS trust store and enables
# Firefox enterprise-root import, so internal HTTPS services (e.g. *.persia.local
# behind the Persia Root CA) work inside streamed sessions without cert warnings.
# Also flags DLP-capability for KasmVNC builds that honour CHISTA_DLP_ENABLED.
#
# Build (any kasmweb/* base):
#   ./build.sh kasmweb/firefox:1.16.0 chista/firefox-trusted:1.16.0
ARG BASE_IMAGE=kasmweb/firefox:1.16.0
FROM ${BASE_IMAGE}

ARG ENABLE_DLP=1
USER root

# Every certs/*.crt is added to the OS trust store.
COPY certs/ /usr/local/share/ca-certificates/chista/
RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates; \
    update-ca-certificates; \
    # Firefox honours OS "enterprise" roots at runtime (reads the system store).
    mkdir -p /etc/firefox/policies; \
    printf '%s' '{"policies":{"Certificates":{"ImportEnterpriseRoots":true}}}' \
      > /etc/firefox/policies/policies.json; \
    rm -rf /var/lib/apt/lists/*

# Honoured by DLP-capable KasmVNC builds; harmless on images that ignore it.
ENV CHISTA_DLP_ENABLED=${ENABLE_DLP}

USER 1000
