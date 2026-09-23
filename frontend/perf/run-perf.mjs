// 性能基线启动器：用 esbuild 将 perf/run.ts（含 src 下的 TS 源码）内存打包为 ESM 后执行。
// 构建流程与本地开发共用同一份门槛 perf/baseline.json，本脚本只是统一的运行入口。
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const entry = resolve(here, 'run.ts')

const result = await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: `node${process.versions.node.split('.')[0]}`,
  write: false,
  sourcemap: 'inline',
  logLevel: 'silent',
})

const output = result.outputFiles[0]
if (!output) {
  console.error('性能基线启动失败：esbuild 未产出打包结果')
  process.exit(1)
}

// 通过 data: URL 执行内存中的打包结果；相对路径 import 已全部被 bundle 进去
const dataUrl = 'data:text/javascript;base64,' + Buffer.from(output.contents).toString('base64')
process.env.PERF_BASELINE_PATH = resolve(here, 'baseline.json')
process.env.PERF_LAST_RUN_PATH = resolve(here, '.last-run.json')
try {
  await import(dataUrl)
} catch (err) {
  // 校验/测量失败只输出消息；打包产物在 data: URL 中，打印堆栈会刷出整份源码
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
}
