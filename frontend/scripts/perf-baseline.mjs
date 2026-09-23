import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const frontendDir = resolve(scriptDir, '..')
const renderEntry = resolve(frontendDir, 'src/generators/renderSvg.ts')
const casesFile = resolve(frontendDir, 'performance/baseline-cases.json')
const thresholdsFile = resolve(frontendDir, 'performance/performance-thresholds.json')
const baselineOutputFile = resolve(frontendDir, 'performance/.last-baseline.json')

const LEVELS = ['low', 'medium', 'high']
const STEPS = ['prepare', 'generate', 'serialize', 'total']
const DEFAULT_KEYS = ['seed', 'rotation', 'strokeWidth', 'opacity', 'bgColor', 'palette', 'width', 'height']
const CASE_KEYS = ['id', 'label', 'pattern', 'level', 'iterations', 'scale', ...DEFAULT_KEYS]
const STEP_LABELS = {
  prepare: '准备 RNG',
  generate: '图案生成',
  serialize: 'SVG 序列化',
  total: '总耗时',
}
const WARMUP_RUNS = 3
const SAMPLE_RUNS = 9

async function loadRenderModule() {
  const result = await build({
    entryPoints: [renderEntry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    logLevel: 'silent',
  })
  const code = result.outputFiles[0].text
  const dataUrl = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`
  return import(dataUrl)
}

async function readJson(path, description) {
  try {
    const text = await readFile(path, 'utf8')
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`${description}不是合法 JSON：${error.message}`)
    }
    if (error && error.code === 'ENOENT') {
      throw new Error(`${description}不存在：${path}`)
    }
    throw new Error(`无法读取${description}：${error.message}`)
  }
}

function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function addError(errors, path, message) {
  errors.push(`${path}：${message}`)
}

function validateDefaults(defaults, errors) {
  if (!isObject(defaults)) {
    addError(errors, 'baseline-cases.json > defaults', '必须是对象')
    return null
  }

  const result = { ...defaults }
  for (const key of Object.keys(result)) {
    if (!DEFAULT_KEYS.includes(key)) {
      addError(errors, `baseline-cases.json > defaults.${key}`, '是未知参数')
    }
  }
  if (!Number.isInteger(result.seed) || result.seed < 0 || result.seed > 99999) {
    addError(errors, 'baseline-cases.json > defaults.seed', '必须是 0 到 99999 之间的整数')
  }
  if (!isFiniteNumber(result.rotation) || result.rotation < 0 || result.rotation > 360) {
    addError(errors, 'baseline-cases.json > defaults.rotation', '必须是 0 到 360 之间的数字')
  }
  if (!isFiniteNumber(result.strokeWidth) || result.strokeWidth < 0.5 || result.strokeWidth > 5) {
    addError(errors, 'baseline-cases.json > defaults.strokeWidth', '必须是 0.5 到 5 之间的数字')
  }
  if (!isFiniteNumber(result.opacity) || result.opacity < 0.1 || result.opacity > 1) {
    addError(errors, 'baseline-cases.json > defaults.opacity', '必须是 0.1 到 1 之间的数字')
  }
  if (typeof result.bgColor !== 'string' || result.bgColor.trim() === '') {
    addError(errors, 'baseline-cases.json > defaults.bgColor', '必须是非空颜色字符串')
  }
  if (!Array.isArray(result.palette) || result.palette.length === 0) {
    addError(errors, 'baseline-cases.json > defaults.palette', '必须至少包含一个颜色')
  } else {
    result.palette.forEach((color, index) => {
      if (typeof color !== 'string' || color.trim() === '') {
        addError(errors, `baseline-cases.json > defaults.palette[${index}]`, '必须是非空颜色字符串')
      }
    })
  }
  if (!Number.isInteger(result.width) || result.width <= 0) {
    addError(errors, 'baseline-cases.json > defaults.width', '必须是正整数')
  }
  if (!Number.isInteger(result.height) || result.height <= 0) {
    addError(errors, 'baseline-cases.json > defaults.height', '必须是正整数')
  }
  return result
}

function validateCaseParams(caseConfig, defaults, patterns, errors) {
  const { __index, id, label, level, pattern, iterations, scale, ...optionalDefaults } = caseConfig
  const params = {
    ...defaults,
    ...optionalDefaults,
    pattern,
    iterations,
    scale,
  }

  if (!patterns.includes(pattern)) {
    addError(errors, `baseline-cases.json > cases[${__index}] > pattern`, `必须是以下值之一：${patterns.join(', ')}`)
  }
  if (!LEVELS.includes(level)) {
    addError(errors, `baseline-cases.json > cases[${__index}] > level`, `必须是以下值之一：${LEVELS.join(', ')}`)
  }
  if (!Number.isInteger(params.seed) || params.seed < 0 || params.seed > 99999) {
    addError(errors, `cases[${id ?? __index}] > seed`, '必须是 0 到 99999 之间的整数')
  }
  if (!Number.isInteger(params.iterations) || params.iterations < 10 || params.iterations > 500) {
    addError(errors, `cases[${id ?? __index}] > iterations`, '必须是 10 到 500 之间的整数')
  }
  if (!isFiniteNumber(params.scale) || params.scale < 0.1 || params.scale > 3) {
    addError(errors, `cases[${id ?? __index}] > scale`, '必须是 0.1 到 3 之间的数字')
  }
  if (!isFiniteNumber(params.rotation) || params.rotation < 0 || params.rotation > 360) {
    addError(errors, `cases[${id ?? __index}] > rotation`, '必须是 0 到 360 之间的数字')
  }
  if (!isFiniteNumber(params.strokeWidth) || params.strokeWidth < 0.5 || params.strokeWidth > 5) {
    addError(errors, `cases[${id ?? __index}] > strokeWidth`, '必须是 0.5 到 5 之间的数字')
  }
  if (!isFiniteNumber(params.opacity) || params.opacity < 0.1 || params.opacity > 1) {
    addError(errors, `cases[${id ?? __index}] > opacity`, '必须是 0.1 到 1 之间的数字')
  }
  if (typeof params.bgColor !== 'string' || params.bgColor.trim() === '') {
    addError(errors, `cases[${id ?? __index}] > bgColor`, '必须是非空颜色字符串')
  }
  if (!Array.isArray(params.palette) || params.palette.length === 0) {
    addError(errors, `cases[${id ?? __index}] > palette`, '必须至少包含一个颜色')
  } else {
    params.palette.forEach((color, index) => {
      if (typeof color !== 'string' || color.trim() === '') {
        addError(errors, `cases[${id ?? __index}] > palette[${index}]`, '必须是非空颜色字符串')
      }
    })
  }
  if (!Number.isInteger(params.width) || params.width <= 0) {
    addError(errors, `cases[${id ?? __index}] > width`, '必须是正整数')
  }
  if (!Number.isInteger(params.height) || params.height <= 0) {
    addError(errors, `cases[${id ?? __index}] > height`, '必须是正整数')
  }
  return { params, level }
}

function validateCases(rawConfig, patterns) {
  const errors = []
  const cases = []
  if (!isObject(rawConfig)) {
    return { cases, errors: ['baseline-cases.json：根节点必须是对象'] }
  }
  if (!Array.isArray(rawConfig.cases)) {
    return { cases, errors: ['baseline-cases.json > cases：必须是数组'] }
  }
  for (const key of Object.keys(rawConfig)) {
    if (!['schemaVersion', 'description', 'defaults', 'cases'].includes(key)) {
      errors.push(`性能参数配置存在未知字段：${key}`)
    }
  }

  const defaults = validateDefaults(rawConfig.defaults, errors)
  const byId = new Map()
  const combinations = new Map()

  rawConfig.cases.forEach((rawCase, index) => {
    if (!isObject(rawCase)) {
      addError(errors, `baseline-cases.json > cases[${index}]`, '必须是对象')
      return
    }

    for (const key of Object.keys(rawCase)) {
      if (!CASE_KEYS.includes(key)) {
        addError(errors, `baseline-cases.json > cases[${index}] > ${key}`, '是未知参数')
      }
    }

    const caseConfig = { ...rawCase, __index: index }
    if (typeof caseConfig.id !== 'string' || caseConfig.id.trim() === '') {
      addError(errors, `baseline-cases.json > cases[${index}] > id`, '必须是非空字符串')
    } else if (byId.has(caseConfig.id)) {
      addError(errors, `baseline-cases.json > cases[${index}] > id`, `与 cases[${byId.get(caseConfig.id)}] 重复`)
    } else {
      byId.set(caseConfig.id, index)
    }

    if (typeof caseConfig.label !== 'string' || caseConfig.label.trim() === '') {
      addError(errors, `cases[${caseConfig.id ?? index}] > label`, '必须是非空字符串')
    }

    const validatedParams = defaults
      ? validateCaseParams(caseConfig, defaults, patterns, errors)
      : null

    if (validatedParams) {
      const { params, level } = validatedParams
      if (patterns.includes(params.pattern) && LEVELS.includes(level)) {
        const key = `${params.pattern}:${level}`
        if (!combinations.has(key)) combinations.set(key, [])
        combinations.get(key).push(caseConfig.id)
        cases.push({
          id: caseConfig.id,
          label: caseConfig.label,
          params,
        })
      }
    }
  })

  for (const pattern of patterns) {
    for (const level of LEVELS) {
      const key = `${pattern}:${level}`
      const matches = combinations.get(key)
      if (!matches || matches.length === 0) {
        errors.push(`参数组合缺失：${pattern} / ${level}（需要每个图案都有 low、medium、high 三档）`)
      } else if (matches.length > 1) {
        errors.push(`参数组合重复：${pattern} / ${level} 出现 ${matches.length} 次（${matches.join(', ')}）`)
      }
    }
  }

  for (const [key, ids] of combinations.entries()) {
    const [pattern, level] = key.split(':')
    if (!patterns.includes(pattern) || !LEVELS.includes(level)) {
      errors.push(`存在未知参数组合：${pattern} / ${level}（${ids.join(', ')}）`)
    }
  }

  return { cases, errors }
}

function validateThresholds(rawThresholds, cases) {
  const errors = []
  const thresholds = new Map()
  if (!isObject(rawThresholds)) {
    return { thresholds, errors: ['performance-thresholds.json：根节点必须是对象'] }
  }
  if (!isObject(rawThresholds.thresholds)) {
    return { thresholds, errors: ['performance-thresholds.json > thresholds：必须是对象'] }
  }
  for (const key of Object.keys(rawThresholds)) {
    if (!['schemaVersion', 'description', 'thresholds'].includes(key)) {
      errors.push(`性能门槛配置存在未知字段：${key}`)
    }
  }

  const validCaseIds = new Set(cases.map(item => item.id))
  for (const [caseId, rawCaseThresholds] of Object.entries(rawThresholds.thresholds)) {
    if (!validCaseIds.has(caseId)) {
      errors.push(`门槛参数组合未知：${caseId}（baseline-cases.json 中没有这一组）`)
      continue
    }
    if (!isObject(rawCaseThresholds)) {
      errors.push(`门槛取值不合法：${caseId} 必须是对象`)
      continue
    }

    const caseThresholds = {}
    for (const step of STEPS) {
      const value = rawCaseThresholds[step]
      if (value === undefined) continue
      if (!isFiniteNumber(value) || value <= 0) {
        errors.push(`门槛取值不合法：${caseId} > ${step} = ${JSON.stringify(value)}，必须是大于 0 的数字`)
      } else {
        caseThresholds[step] = value
      }
    }

    for (const step of Object.keys(rawCaseThresholds)) {
      if (!STEPS.includes(step)) {
        errors.push(`门槛步骤未知：${caseId} > ${step}（允许值：${STEPS.join(', ')}）`)
      }
    }
    thresholds.set(caseId, caseThresholds)
  }

  for (const testCase of cases) {
    const caseThresholds = thresholds.get(testCase.id)
    if (!caseThresholds) {
      errors.push(`门槛参数组合缺失：${testCase.id}（${testCase.label}，iterations=${testCase.params.iterations}, scale=${testCase.params.scale}）`)
      continue
    }
    for (const step of STEPS) {
      if (!isFiniteNumber(caseThresholds[step])) {
        errors.push(`门槛缺失：${testCase.id} > ${step}（${testCase.label}）`)
      }
    }
  }

  return { thresholds, errors }
}

async function readPreviousBaseline() {
  let raw
  try {
    raw = await readJson(baselineOutputFile, '本地性能基线')
  } catch (error) {
    return { baselines: new Map(), warnings: [error.message] }
  }

  const warnings = []
  const baselines = new Map()
  if (!isObject(raw) || !isObject(raw.cases)) {
    warnings.push('本地性能基线结构不合法：根节点或 cases 字段不是对象，本次不使用历史数据对比')
    return { baselines, warnings }
  }

  for (const [caseId, entry] of Object.entries(raw.cases)) {
    if (!isObject(entry) || !isObject(entry.timings)) {
      warnings.push(`本地性能基线跳过 ${caseId}：timings 必须是对象`)
      continue
    }
    const timings = {}
    for (const step of STEPS) {
      const value = entry.timings[step]
      if (!isFiniteNumber(value) || value < 0) {
        warnings.push(`本地性能基线跳过 ${caseId} > ${step}：历史值 ${JSON.stringify(value)} 不是合法的非负数字`)
      } else {
        timings[step] = value
      }
    }
    if (Object.keys(timings).length > 0) baselines.set(caseId, timings)
  }

  return { baselines, warnings }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function updateChecksum(checksum, text) {
  for (let i = 0; i < text.length; i++) {
    checksum = (checksum + Math.imul(i + 1, text.charCodeAt(i) + 1)) >>> 0
  }
  return (checksum + text.length) >>> 0
}

async function measureCases(cases, renderModule) {
  const results = []
  let checksum = 2166136261

  for (const testCase of cases) {
    for (let run = 0; run < WARMUP_RUNS; run++) {
      const warmed = renderModule.timedRenderSvg(testCase.params)
      checksum = updateChecksum(checksum, warmed.content)
    }

    globalThis.gc?.()
    const samples = []
    let contentLength = 0
    for (let run = 0; run < SAMPLE_RUNS; run++) {
      const rendered = renderModule.timedRenderSvg(testCase.params)
      samples.push(rendered.timings)
      contentLength = rendered.content.length
      checksum = updateChecksum(checksum, rendered.content)
      globalThis.gc?.()
    }

    const timings = {}
    for (const step of STEPS) {
      timings[step] = median(samples.map(sample => sample[step]))
    }
    results.push({ ...testCase, timings, contentLength })
  }

  return { results, checksum: checksum.toString(16).padStart(8, '0') }
}

function formatMs(value) {
  return `${value.toFixed(3)}ms`
}

function formatSignedMs(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(3)}ms`
}

function formatPercent(value) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`
}

function printReport(results, thresholds, previousBaselines) {
  const failures = []

  for (const result of results) {
    const caseThresholds = thresholds.get(result.id)
    console.log(`\n${result.label} [${result.id}]`)
    console.log(`  参数：iterations=${result.params.iterations}, scale=${result.params.scale}, seed=${result.params.seed}, size=${result.params.width}x${result.params.height}`)
    console.log('  步骤             当前耗时    门槛        与门槛差异        上次基线    较上次差异')

    for (const step of STEPS) {
      const current = result.timings[step]
      const threshold = caseThresholds?.[step]
      const previous = previousBaselines.get(result.id)?.[step]
      const thresholdDelta = current - threshold
      const thresholdPercent = (thresholdDelta / threshold) * 100
      const passed = current <= threshold
      if (!passed) {
        failures.push({
          caseId: result.id,
          label: result.label,
          step,
          current,
          threshold,
          delta: thresholdDelta,
          percent: thresholdPercent,
          params: result.params,
        })
      }

      const previousText = previous === undefined ? '—' : formatMs(previous)
      const previousDeltaText = previous === undefined
        ? '—'
        : `${formatSignedMs(current - previous)} (${formatPercent(((current - previous) / previous) * 100)})`

      console.log(
        `  ${STEP_LABELS[step].padEnd(12)}  ${formatMs(current).padStart(9)}  ` +
        `${formatMs(threshold).padStart(9)}  ` +
        `${`${formatSignedMs(thresholdDelta)} (${formatPercent(thresholdPercent)})`.padStart(15)}  ` +
        `${previousText.padStart(9)}  ${previousDeltaText}  ${passed ? 'PASS' : 'FAIL'}`
      )
    }
  }

  return failures
}

async function saveBaseline(results, checksum, status, failures) {
  const baseline = {
    schemaVersion: 1,
    recordedAt: new Date().toISOString(),
    status,
    environment: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    options: {
      warmupRuns: WARMUP_RUNS,
      sampleRuns: SAMPLE_RUNS,
    },
    checksum,
    cases: Object.fromEntries(results.map(result => [
      result.id,
      {
        label: result.label,
        params: result.params,
        contentLength: result.contentLength,
        timings: result.timings,
      },
    ])),
  }

  if (failures.length > 0) {
    baseline.failures = failures.map(failure => ({
      caseId: failure.caseId,
      label: failure.label,
      step: failure.step,
      current: failure.current,
      threshold: failure.threshold,
      delta: failure.delta,
      percent: failure.percent,
    }))
  }

  await mkdir(dirname(baselineOutputFile), { recursive: true })
  await writeFile(baselineOutputFile, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
}

async function main() {
  console.log('性能基线检查')
  console.log(`固定参数：${casesFile}`)
  console.log(`共享门槛：${thresholdsFile}`)
  console.log(`本地基线：${baselineOutputFile}`)
  console.log(`预热 ${WARMUP_RUNS} 次，正式采样 ${SAMPLE_RUNS} 次，报告每步耗时中位数`)

  const renderModule = await loadRenderModule()
  const patterns = [...renderModule.PATTERN_TYPES]
  const [rawCases, rawThresholds] = await Promise.all([
    readJson(casesFile, '性能参数组合文件'),
    readJson(thresholdsFile, '性能门槛文件'),
  ])

  const { cases, errors: caseErrors } = validateCases(rawCases, patterns)
  const { thresholds, errors: thresholdErrors } = validateThresholds(rawThresholds, cases)
  const configurationErrors = [...caseErrors, ...thresholdErrors]
  if (configurationErrors.length > 0) {
    console.error('\n性能基线配置无效，已终止，未静默跳过任何项目：')
    for (const error of configurationErrors) console.error(`- ${error}`)
    process.exitCode = 1
    return
  }

  const { baselines: previousBaselines, warnings: baselineWarnings } = await readPreviousBaseline()
  for (const warning of baselineWarnings) console.warn(`警告：${warning}`)

  const { results, checksum } = await measureCases(cases, renderModule)
  const failures = printReport(results, thresholds, previousBaselines)

  const status = failures.length === 0 ? 'pass' : 'fail'
  await saveBaseline(results, checksum, status, failures)

  console.log(`\n输出校验和：${checksum}`)
  console.log(`本地基线已保存：${baselineOutputFile}`)

  if (failures.length > 0) {
    console.error('\n性能门槛未通过：')
    for (const failure of failures) {
      console.error(
        `- ${failure.label} [${failure.caseId}] / ${STEP_LABELS[failure.step]}：` +
        `${formatMs(failure.current)} > ${formatMs(failure.threshold)} ` +
        `(${formatSignedMs(failure.delta)}, ${formatPercent(failure.percent)})；` +
        `参数 iterations=${failure.params.iterations}, scale=${failure.params.scale}, seed=${failure.params.seed}`
      )
    }
    process.exitCode = 1
    return
  }

  console.log('\n所有性能基线均通过。')
}

main().catch(error => {
  console.error(`\n性能基线流程执行失败：${error.stack || error.message}`)
  process.exitCode = 1
})
