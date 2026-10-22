ARG DEBIAN_TAG=trixie-slim

FROM debian:${DEBIAN_TAG} AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      build-essential pkg-config liblzma-dev \
 && rm -rf /var/lib/apt/lists/*

RUN v="$(dpkg-query -W -f='${Version}' liblzma-dev)"; \
    case "$v" in 5.6.0*|5.6.1*) echo "Refusing backdoored liblzma $v" >&2; exit 1;; esac

WORKDIR /src
COPY Makefile ./
COPY src/ ./src/
RUN make -j"$(nproc)" \
 && strip build/packguard

FROM debian:${DEBIAN_TAG} AS final
RUN apt-get update \
 && apt-get install -y --no-install-recommends liblzma5 \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --shell /usr/sbin/nologin packguard
COPY --from=build /src/build/packguard /usr/local/bin/packguard
WORKDIR /work
USER packguard
ENTRYPOINT ["packguard"]
