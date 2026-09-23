import type { PatternType } from '../src/types'

export const TIERS = ['low', 'mid', 'high'] as const
export type Tier = (typeof TIERS)[number]

export const STEP_KEYS = ['generateMs', 'wrapMs', 'totalMs'] as const
export type StepKey = (typeof STEP_KEYS)[number]

export const STEP_LABELS: Record<StepKey, string> = {
  generateMs: '图案生成',
  wrapMs: 'SVG 组装',
  totalMs: '总耗时',
}

/** 单个参数组合的耗时门槛（毫秒），与测量步骤一一对应 */
export type Thresholds = Record<StepKey, number>

export interface BaselineCase {
  pattern: PatternType
  tier: Tier
  iterations: number
  scale: number
  thresholds: Thresholds
}

export interface BaselineDefaults {
  width: number
  height: number
  seed: number
  theme: string
  strokeWidth: number
  opacity: number
  bgColor: string
  rotation: number
}

export interface MeasurementConfig {
  warmupRuns: number
  measuredRuns: number
  /** perf:update 时门槛 = 实测中位数 × (1 + thresholdMarginRatio) */
  thresholdMarginRatio: number
  /** 门槛地板（毫秒），防止亚毫秒步骤的 0 门槛误判 */
  minThresholdMs: number
}

export interface Baseline {
  version: number
  updatedAt: string | null
  note?: string
  defaults: BaselineDefaults
  measurement: MeasurementConfig
  cases: BaselineCase[]
}

/** 单次完整测量结果（每一步的毫秒中位数） */
export interface CaseMeasurement {
  pattern: PatternType
  tier: Tier
  iterations: number
  scale: number
  generateMs: number
  wrapMs: number
  totalMs: number
}

export interface LastRun {
  version: 1
  recordedAt: string
  node: string
  warmupRuns: number
  measuredRuns: number
  measurements: CaseMeasurement[]
}
