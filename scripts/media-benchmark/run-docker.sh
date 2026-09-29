#!/usr/bin/env bash
# Benchmark de 50 MP em container Linux restrito a 2 GB / 1 vCPU
# (F2-008, #46; media-pipeline-contract.md, secao 16).
#
# Mesmo Node (24.19) e mesmo sharp (0.35.5) do projeto, instalados DENTRO do
# container (o binario do sharp e por plataforma). O codigo medido e o real:
# src/modules/media/image-processing.ts, montado somente leitura.
#
# Uso (na raiz do repositorio): bash scripts/media-benchmark/run-docker.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))"
IMAGE="node:24.19.0-bookworm-slim"
SHARP_VERSION="$(node -p "require('sharp').versions.sharp")"
MEMORY="2g"
CPUS="1"

MSYS_NO_PATHCONV=1 docker run --rm \
  --memory="$MEMORY" --memory-swap="$MEMORY" --cpus="$CPUS" \
  -e SHARP_VERSION="$SHARP_VERSION" \
  -v "$ROOT/src/modules/media:/bench/src/modules/media:ro" \
  -v "$ROOT/scripts/media-benchmark:/bench/scripts/media-benchmark:ro" \
  -w /bench \
  "$IMAGE" bash -euo pipefail -c '
    echo "{\"node\":\"$(node -v)\",\"memLimitBytes\":$(cat /sys/fs/cgroup/memory.max),\"cpuMax\":\"$(cat /sys/fs/cgroup/cpu.max)\"}"
    corepack enable >/dev/null 2>&1
    echo "{\"name\":\"bench\",\"private\":true,\"type\":\"module\"}" > package.json
    pnpm add "sharp@$SHARP_VERSION" --silent >/dev/null 2>&1
    node -e "console.log(JSON.stringify({sharp: require(\"sharp\").versions.sharp, vips: require(\"sharp\").versions.vips, defaultConcurrency: require(\"sharp\").concurrency()}))"
    node scripts/media-benchmark/generate-fixtures.ts fixtures
    run() {
      set +e
      node scripts/media-benchmark/run-scenario.ts "$@"
      code=$?
      set -e
      echo "{\"scenario\":\"$*\",\"exitCode\":$code}"
    }
    for f in png16-50mp-orient6.png jpeg-50mp.jpg; do
      for cfg in "default default" "off default" "off 1" "default 1"; do
        run fixtures/$f 1 $cfg
        run fixtures/$f 2 $cfg
      done
    done
    for f in animated.webp truncated.png fake.jpg empty.png noise-1600.png valid.jpg valid.png valid.webp small-300.png gif.gif tiff.tiff svg.svg; do
      run fixtures/$f 1 off 1
    done
  '
