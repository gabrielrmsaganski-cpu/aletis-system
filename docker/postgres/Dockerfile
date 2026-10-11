FROM postgres:16-alpine

ARG PGVECTOR_VERSION=0.8.1

RUN apk add --no-cache --virtual .pgvector-build-deps \
      build-base \
      clang19 \
      git \
      llvm19 \
      llvm19-linker-tools \
    && git clone --depth 1 --branch "v${PGVECTOR_VERSION}" https://github.com/pgvector/pgvector.git /tmp/pgvector \
    && cd /tmp/pgvector \
    && make \
    && make install \
    && rm -rf /tmp/pgvector \
    && apk del .pgvector-build-deps
