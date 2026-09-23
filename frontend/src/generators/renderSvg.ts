import type { DesignParams, PatternType } from '../types'
import {
  createRng,
  generateCircles,
  generateFractal,
  generateNoise,
  generateSpiral,
  generateWave,
} from './patterns'

type PatternGenerator = (
  w: number,
  h: number,
  iterations: number,
  scale: number,
  palette: string[],
  rng: ReturnType<typeof createRng>,
  strokeWidth: number,
  opacity: number
) => string

export const PATTERN_TYPES = ['spiral', 'fractal', 'wave', 'circles', 'noise'] as const

export const PATTERN_GENERATORS: Record<PatternType, PatternGenerator> = {
  spiral: generateSpiral,
  fractal: generateFractal,
  wave: generateWave,
  circles: generateCircles,
  noise: generateNoise,
}

export interface RenderTimings {
  prepare: number
  generate: number
  serialize: number
  total: number
}

export interface RenderSvgResult {
  svg: string
  content: string
  timings: RenderTimings
}

export function renderSvg(params: DesignParams): string {
  return timedRenderSvg(params).svg
}

export function timedRenderSvg(params: DesignParams): RenderSvgResult {
  const totalStart = performance.now()

  const prepareStart = performance.now()
  const rng = createRng(params.seed)
  const generator = PATTERN_GENERATORS[params.pattern]
  if (!generator) throw new Error(`不支持的图案类型: ${params.pattern}`)
  const prepare = performance.now() - prepareStart

  const generateStart = performance.now()
  const content = generator(
    params.width,
    params.height,
    params.iterations,
    params.scale,
    params.palette,
    rng,
    params.strokeWidth,
    params.opacity
  )
  const generate = performance.now() - generateStart

  const serializeStart = performance.now()
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${params.width}" height="${params.height}" viewBox="0 0 ${params.width} ${params.height}">
  <rect width="${params.width}" height="${params.height}" fill="${params.bgColor}"/>
  <g transform="rotate(${params.rotation},${params.width / 2},${params.height / 2})">${content}</g>
</svg>`
  const serialize = performance.now() - serializeStart

  return {
    svg,
    content,
    timings: {
      prepare,
      generate,
      serialize,
      total: performance.now() - totalStart,
    },
  }
}
