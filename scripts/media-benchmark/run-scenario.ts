// Mede um cenario do benchmark de 50 MP com o codigo REAL de processamento
// (src/modules/media/image-processing.ts). Um cenario por processo, para o pico
// de RSS nao herdar a geracao de fixtures nem cenarios anteriores.
//
// Uso: node scripts/media-benchmark/run-scenario.ts <fixture> <paralelas> [cache] [concorrencia]
//   cache: default | off        concorrencia: default | 1 | 2
import { existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { processImageBuffer } from '../../src/modules/media/image-processing.ts';

const [fixture, parallelArg = '1', cacheArg = 'default', concurrencyArg = 'default'] =
  process.argv.slice(2);
const parallel = Number(parallelArg);

if (cacheArg === 'off') sharp.cache(false);
if (concurrencyArg !== 'default') sharp.concurrency(Number(concurrencyArg));

const input = readFileSync(fixture);

let peakRss = 0;
let peakExternal = 0;
let peakHeapUsed = 0;
const sample = () => {
  const m = process.memoryUsage();
  peakRss = Math.max(peakRss, m.rss);
  peakExternal = Math.max(peakExternal, m.external);
  peakHeapUsed = Math.max(peakHeapUsed, m.heapUsed);
};
const timer = setInterval(sample, 20);

const started = performance.now();
const results = await Promise.all(
  Array.from({ length: parallel }, async () => {
    const t0 = performance.now();
    const r = await processImageBuffer(input);
    return { ms: Math.round(performance.now() - t0), r };
  }),
);
const wallMs = Math.round(performance.now() - started);
sample();
clearInterval(timer);

const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;
// Pico real de RSS do processo pelo kernel (Linux), sem depender da amostragem.
const vmHwmKb = existsSync('/proc/self/status')
  ? Number(/VmHWM:\s+(\d+)/.exec(readFileSync('/proc/self/status', 'utf8'))?.[1] ?? NaN)
  : NaN;
console.log(
  JSON.stringify({
    fixture: fixture.split('/').pop(),
    inputBytes: input.length,
    parallel,
    cache: cacheArg,
    concurrency: sharp.concurrency(),
    wallMs,
    peakRssMb: mb(peakRss),
    vmHwmMb: Number.isNaN(vmHwmKb) ? null : Math.round((vmHwmKb / 1024) * 10) / 10,
    peakHeapUsedMb: mb(peakHeapUsed),
    peakExternalMb: mb(peakExternal),
    runs: results.map(({ ms, r }) =>
      r.ok
        ? {
            ms,
            ok: true,
            format: r.format,
            orientedWidth: r.width,
            orientedHeight: r.height,
            derivatives: r.derivatives.map((d) => ({
              kind: d.kind,
              width: d.width,
              height: d.height,
              bytes: d.data.length,
            })),
          }
        : { ms, ok: false, code: r.code },
    ),
  }),
);
