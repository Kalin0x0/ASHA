# Chista guacd with H.264 / GFX-AVC444 support.
#
# The official guacamole/guacd images bundle a FreeRDP compiled WITHOUT H.264
# (WITH_GFX_H264=OFF, WITH_FFMPEG=OFF), so modern Windows RDP using the GFX
# graphics pipeline (RemoteFX Advanced / AVC444) renders as a black screen
# (only the cursor draws). This image builds guacamole-server 1.5.5 against
# Debian's FreeRDP, which IS built with libavcodec (WITH_GFX_H264=ON,
# WITH_FFMPEG=TRUE) — so the RDP plugin (libguac-client-rdp) links libavcodec/
# libswscale and can decode the GFX/H.264 stream.
#
# Build:  docker build -t chista-guacd-h264:1.5.5 infra/guacd-h264
# Used by the `guacd` service in docker-compose.yml.
FROM debian:bookworm
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential autoconf automake libtool pkg-config wget ca-certificates \
      libcairo2-dev libjpeg62-turbo-dev libpng-dev libtool-bin libossp-uuid-dev \
      freerdp2-dev libavcodec-dev libavformat-dev libavutil-dev libswscale-dev \
      libpango1.0-dev libssh2-1-dev libtelnet-dev libvncserver-dev \
      libpulse-dev libssl-dev libvorbis-dev libwebp-dev libwebsockets-dev \
 && wget -q https://archive.apache.org/dist/guacamole/1.5.5/source/guacamole-server-1.5.5.tar.gz \
 && tar xzf guacamole-server-1.5.5.tar.gz \
 && cd guacamole-server-1.5.5 \
 && ./configure --prefix=/opt/guacamole --disable-guacenc \
 && make -j2 && make install && ldconfig \
 && cd / && rm -rf guacamole-server-1.5.5* /var/lib/apt/lists/*
ENV LD_LIBRARY_PATH=/opt/guacamole/lib GUACD_LOG_LEVEL=info
EXPOSE 4822
CMD ["/bin/sh", "-c", "/opt/guacamole/sbin/guacd -b 0.0.0.0 -L $GUACD_LOG_LEVEL -f"]
