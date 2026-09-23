import { performance } from 'node:perf_hooks'
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'
import { renderPattern, wrapSvg, type RenderInput } from '../src/generators/render'
import { THEMES } from '../src/themes/palettes'
import { loadBaseline, unsetThresholdCases, caseId } from './validate'
import {
  STEP_KEYS, STEP_LABELS,
  type Baseline, type BaselineCase, type CaseMeasurement, type LastRun, type StepKey,
} from './types'

// 路径由启动器 perf/run-perf.mjs 注入（打包后 import.meta.url 指向 data: URL，无法据此定位文件）
const baselinePath = process.env.PERF_BASELINE_PATH
const lastRunPath = process.env.PERF_LAST_RUN_PATH
if (!baselinePath || !lastRunPath) {
  console.error('内部错误：缺少 PERF_BASELINE_PATH / PERF_LAST_RUN_PATH 环境变量，请通过 npm run perf 运行')
  process.exit(1)
}
const BASELINE_PATH: string = baselinePath
const LAST_RUN_PATH: string = lastRunPath

const UPDATE = process.argv.includes('--update')

function log(msg = '') {
  console.log(msg)
}

function fmt(ms: number): string {
  return `${ms.toFixed(3)}ms`
}

/** 对单组参数反复测量，返回各步骤毫秒中位数 */
function measureCase(input: RenderInput, warmupRuns: number, measuredRuns: number): Omit<CaseMeasurement, 'tier'> {
  for (let i = 0; i < warmupRuns; i++) {
    const svg = wrapSvg(renderPattern(input), input)
    if (svg.length === 0) throw new Error('生成结果为空')
  }

  const generate: number[] = new Array(measuredRuns)
  const wrap: number[] = new Array(measuredRuns)
  const total: number[] = new Array(measuredRuns)
  let sink = 0

  for (let i = 0; i < measuredRuns; i++) {
    const t0 = performance.now()
    const content = renderPattern(input)
    const t1 = performance.now()
    const svg = wrapSvg(content, input)
    const t2 = performance.now()
    generate[i] = t1 - t0
    wrap[i] = t2 - t1
    total[i] = t2 - t0
    sink += svg.length + content.length
  }
  if (sink <= 0) throw new Error('生成结果为空') // 防止 JIT 将整体测量消除

  return {
    pattern: input.pattern,
    iterations: input.iterations,
    scale: input.scale,
    generateMs: median(generate),
    wrapMs: median(wrap),
    totalMs: median(total),
  }
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function toInput(baseline: Baseline, c: BaselineCase): RenderInput {
  const theme = THEMES.find(t => t.id === baseline.defaults.theme)
  if (!theme) throw new Error(`默认主题不存在：${baseline.defaults.theme}`)
  const d = baseline.defaults
  return {
    width: d.width,
    height: d.height,
    pattern: c.pattern,
    seed: d.seed,
    iterations: c.iterations,
    scale: c.scale,
    palette: theme.colors,
    strokeWidth: d.strokeWidth,
    opacity: d.opacity,
    bgColor: d.bgColor,
    rotation: d.rotation,
  }
}

function loadLastRun(): LastRun | null {
  if (!existsSync(LAST_RUN_PATH)) return null
  try {
    const parsed = JSON.parse(readFileSync(LAST_RUN_PATH, 'utf8')) as LastRun
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.measurements)) {
      log(`⚠️  本地历史结果 ${LAST_RUN_PATH} 版本/格式不兼容，本次将忽略并覆盖该文件`)
      return null
    }
    return parsed
  } catch (err) {
    log(`⚠️  本地历史结果 ${LAST_RUN_PATH} 无法解析（${(err as Error).message}），本次将忽略并覆盖该文件`)
    return null
  }
}

interface Violation {
  id: string
  iterations: number
  scale: number
  step: StepKey
  value: number
  threshold: number
}

function main(): void {
  const baseline = loadBaseline(BASELINE_PATH)
  const { warmupRuns, measuredRuns } = baseline.measurement

  if (UPDATE) {
    log('🔄 基线更新模式：测量完成后将用实测中位数重写 baseline.json，不做超限判定')
  } else {
    // 门槛取值不合法（0/未初始化）必须在日志中说明，不能静默当成“无门槛”
    const unset = unsetThresholdCases(baseline)
    if (unset.length > 0) {
      console.error('❌ 门槛取值不合法：以下参数组合的门槛仍为 0（基线尚未建立），不能进行性能检查：')
      for (const c of unset) {
        console.error(`  - ${caseId(c)}（iterations=${c.iterations}, scale=${c.scale}）`)
      }
      console.error('   请先运行 npm run perf:update 建立基线，门槛将取各步骤实测中位数。')
      process.exit(1)
    }
  }

  const lastRun = UPDATE ? null : loadLastRun()
  const previous = new Map<string, CaseMeasurement>()
  if (lastRun) {
    for (const m of lastRun.measurements) previous.set(`${m.pattern}|${m.tier}`, m)
  }

  log(`性能基线（${baseline.cases.length} 组参数 × (预热 ${warmupRuns} + 实测 ${measuredRuns}) 次，取中位数）`)
  log(`门槛文件: ${BASELINE_PATH}${UPDATE ? '' : `｜上次本地结果: ${lastRun ? lastRun.recordedAt : '无（首次运行）'}`}`)
  log('')

  const measurements: CaseMeasurement[] = []
  for (const c of baseline.cases) {
    const input = toInput(baseline, c)
    const m: CaseMeasurement = { ...measureCase(input, warmupRuns, measuredRuns), tier: c.tier }
    measurements.push(m)

    const id = caseId(c)
    const prev = previous.get(`${c.pattern}|${c.tier}`)
    log(`● ${id}  iterations=${c.iterations} scale=${c.scale}`)
    for (const step of STEP_KEYS) {
      const value = m[step]
      const label = STEP_LABELS[step]
      if (UPDATE) {
        log(`    ${label}  ${fmt(value)}`)
        continue
      }
      const threshold = c.thresholds[step]
      const over = value > threshold
      const diff = value - threshold
      const sign = diff >= 0 ? '+' : ''
      const prevText = prev ? `，较上次 ${sign}${(value - prev[step]).toFixed(3)}ms` : ''
      const status = over ? '超限 ❌' : 'OK'
      log(`    ${label}  ${fmt(value)} / 门槛 ${fmt(threshold)}（${sign}${diff.toFixed(3)}ms，${status}${prevText}）`)
    }
    log('')
  }

  // 本地保存本次结果，供下次对照复用
  const record: LastRun = {
    version: 1,
    recordedAt: new Date().toISOString(),
    node: process.version,
    warmupRuns,
    measuredRuns,
    measurements,
  }
  mkdirSync(LAST_RUN_PATH.slice(0, LAST_RUN_PATH.lastIndexOf('/')), { recursive: true })
  writeFileSync(LAST_RUN_PATH, `${JSON.stringify(record, null, 2)}\n`)

  if (UPDATE) {
    const updated: Baseline = {
      ...baseline,
      updatedAt: record.recordedAt,
      cases: baseline.cases.map(c => {
        const m = measurements.find(x => x.pattern === c.pattern && x.tier === c.tier)
        if (!m) throw new Error(`内部错误：缺少 ${caseId(c)} 的测量结果`)
        const thresholds = {} as Record<StepKey, number>
        for (const step of STEP_KEYS) {
          // 门槛 = 实测中位数 ×(1+余量)，且不低于地板值；避免测量抖动导致偶发误报、0ms 门槛误判
          const margin = baseline.measurement.thresholdMarginRatio
          const floor = baseline.measurement.minThresholdMs
          thresholds[step] = round3(Math.max(floor, m[step] * (1 + margin)))
        }
        return { ...c, thresholds }
      }),
    }
    writeFileSync(BASELINE_PATH, `${JSON.stringify(updated, null, 2)}\n`)
    log(`✅ 已更新门槛文件: ${BASELINE_PATH}（updatedAt=${record.recordedAt}）`)
    log(`✅ 本次结果已保存: ${LAST_RUN_PATH}`)
    return
  }

  const violations: Violation[] = []
  for (const c of baseline.cases) {
    const m = measurements.find(x => x.pattern === c.pattern && x.tier === c.tier)
    if (!m) throw new Error(`内部错误：缺少 ${caseId(c)} 的测量结果`)
    for (const step of STEP_KEYS) {
      if (m[step] > c.thresholds[step]) {
        violations.push({ id: caseId(c), iterations: c.iterations, scale: c.scale, step, value: m[step], threshold: c.thresholds[step] })
      }
    }
  }

  log(`本次结果已保存: ${LAST_RUN_PATH}`)
  if (violations.length > 0) {
    log('')
    console.error(`❌ 性能基线检查失败：${violations.length} 个步骤超过门槛`)
    for (const v of violations) {
      console.error(
        `  - 参数组 ${v.id}（iterations=${v.iterations}, scale=${v.scale}）: ` +
        `${STEP_LABELS[v.step]} ${fmt(v.value)} > 门槛 ${fmt(v.threshold)}`
      )
    }
    console.error('  如确认本次变慢合理，请排查原因后运行 npm run perf:update 重新建立基线。')
    process.exit(1)
  }
  log('✅ 全部步骤均在门槛之内。')
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

main()
