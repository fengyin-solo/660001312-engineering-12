import { readFileSync } from 'node:fs'
import { PATTERN_GENERATORS } from '../src/generators/render'
import { THEMES } from '../src/themes/palettes'
import {
  TIERS, STEP_KEYS,
  type Baseline, type BaselineCase, type Tier,
} from './types'

/** 读取并整体校验门槛文件；任何问题都以明确原因抛出，绝不静默忽略 */
export function loadBaseline(path: string): Baseline {
  const raw = readJson(path)
  return validateBaseline(raw)
}

function readJson(path: string): unknown {
  let text: string
  try {
    text = readFileSync(path, 'utf8')
  } catch (err) {
    throw new Error(`无法读取门槛文件 ${path}: ${(err as Error).message}`)
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    throw new Error(`门槛文件 ${path} 不是合法 JSON: ${(err as Error).message}`)
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isPositiveInteger(v: unknown): v is number {
  return isFiniteNumber(v) && Number.isInteger(v) && v > 0
}

function validateBaseline(raw: unknown): Baseline {
  const errors: string[] = []
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('门槛文件根节点必须是对象')
  }
  const b = raw as Record<string, unknown>

  if (!isPositiveInteger(b.version)) errors.push('version 必须是正整数')

  const defaults = b.defaults as Record<string, unknown> | undefined
  if (typeof defaults !== 'object' || defaults === null) {
    errors.push('defaults 缺失或不是对象')
  } else {
    if (!isPositiveInteger(defaults.width)) errors.push('defaults.width 必须是正整数')
    if (!isPositiveInteger(defaults.height)) errors.push('defaults.height 必须是正整数')
    if (!isFiniteNumber(defaults.seed) || defaults.seed < 0) errors.push('defaults.seed 必须是非负数')
    if (typeof defaults.theme !== 'string' || !THEMES.some(t => t.id === defaults.theme)) {
      errors.push(`defaults.theme 取值不合法：${String(defaults.theme)}（可选：${THEMES.map(t => t.id).join('、')}）`)
    }
    if (!isFiniteNumber(defaults.strokeWidth) || defaults.strokeWidth <= 0) errors.push('defaults.strokeWidth 必须是正数')
    if (!isFiniteNumber(defaults.opacity) || defaults.opacity <= 0 || defaults.opacity > 1) {
      errors.push('defaults.opacity 必须在 (0, 1] 范围内')
    }
    if (typeof defaults.bgColor !== 'string' || defaults.bgColor.trim() === '') {
      errors.push('defaults.bgColor 必须是非空颜色字符串')
    }
    if (!isFiniteNumber(defaults.rotation)) errors.push('defaults.rotation 必须是数值')
  }

  const measurement = b.measurement as Record<string, unknown> | undefined
  if (typeof measurement !== 'object' || measurement === null) {
    errors.push('measurement 缺失或不是对象')
  } else {
    if (!isPositiveInteger(measurement.warmupRuns)) errors.push('measurement.warmupRuns 必须是正整数')
    if (!isPositiveInteger(measurement.measuredRuns)) errors.push('measurement.measuredRuns 必须是正整数')
    if (!isFiniteNumber(measurement.thresholdMarginRatio) ||
      (measurement.thresholdMarginRatio as number) < 0 || (measurement.thresholdMarginRatio as number) > 10) {
      errors.push('measurement.thresholdMarginRatio 必须是 [0, 10] 范围内的数值')
    }
    if (!isFiniteNumber(measurement.minThresholdMs) || (measurement.minThresholdMs as number) < 0) {
      errors.push('measurement.minThresholdMs 必须是非负数值（毫秒）')
    }
  }

  if (!Array.isArray(b.cases)) {
    errors.push('cases 缺失或不是数组')
    throw new Error(formatErrors(errors))
  }

  const seen = new Set<string>()
  const caseKeys = new Set<string>()
  for (let i = 0; i < b.cases.length; i++) {
    const where = `cases[${i}]`
    const c = b.cases[i] as Record<string, unknown> | null
    if (typeof c !== 'object' || c === null) {
      errors.push(`${where} 不是对象`)
      continue
    }
    const patternOk = typeof c.pattern === 'string' && c.pattern in PATTERN_GENERATORS
    if (!patternOk) {
      errors.push(`${where}.pattern 取值不合法：${String(c.pattern)}（已实现图案：${Object.keys(PATTERN_GENERATORS).join('、')}）`)
    }
    const tierOk = typeof c.tier === 'string' && (TIERS as readonly string[]).includes(c.tier)
    if (!tierOk) {
      errors.push(`${where}.tier 取值不合法：${String(c.tier)}（必须是 ${TIERS.join('/')} 之一）`)
    }
    if (!isPositiveInteger(c.iterations)) errors.push(`${where}.iterations 必须是正整数：${String(c.iterations)}`)
    if (!isFiniteNumber(c.scale) || (c.scale as number) <= 0) errors.push(`${where}.scale 必须是正数：${String(c.scale)}`)

    const thresholds = c.thresholds as Record<string, unknown> | undefined
    if (typeof thresholds !== 'object' || thresholds === null) {
      errors.push(`${where}.thresholds 缺失或不是对象`)
    } else {
      for (const step of STEP_KEYS) {
        const v = thresholds[step]
        if (!isFiniteNumber(v) || (v as number) < 0) {
          errors.push(`${where}.thresholds.${step} 必须是非负数值（毫秒）：${String(v)}`)
        }
      }
    }

    if (patternOk && tierOk) {
      const key = `${c.pattern}|${c.tier}`
      if (caseKeys.has(key)) {
        errors.push(`${where} 参数组合重复：${c.pattern} / ${c.tier}（同一图案同一档位只能出现一次）`)
      }
      caseKeys.add(key)
      seen.add(key)
    }
  }

  if (errors.length > 0) throw new Error(formatErrors(errors))

  // 参数组合完整性：每种已实现图案都必须有 low/mid/high 三档，缺失要明确报出，不静默跳过
  for (const pattern of Object.keys(PATTERN_GENERATORS)) {
    for (const tier of TIERS) {
      if (!seen.has(`${pattern}|${tier}`)) {
        errors.push(`参数组合缺失：图案 ${pattern} 缺少 ${tier} 档（每种图案必须各取 low、mid、high 三档）`)
      }
    }
  }

  if (errors.length > 0) throw new Error(formatErrors(errors))
  return raw as unknown as Baseline
}

function formatErrors(errors: string[]): string {
  return `门槛文件校验失败，共 ${errors.length} 个问题：\n` + errors.map(e => `  - ${e}`).join('\n')
}

/** 门槛是否尚未初始化（全 0）；检查模式下视为不合法，需先 perf:update 建立基线 */
export function unsetThresholdCases(baseline: Baseline): BaselineCase[] {
  return baseline.cases.filter(c => STEP_KEYS.some(s => c.thresholds[s] <= 0))
}

export function caseId(c: { pattern: string; tier: Tier | string }): string {
  return `${c.pattern}/${c.tier}`
}
