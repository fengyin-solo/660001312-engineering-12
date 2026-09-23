import type { PatternType } from '../types'
import {
  createRng,
  generateSpiral, generateFractal, generateWave, generateCircles, generateNoise,
} from './patterns'

export interface RenderInput {
  width: number
  height: number
  pattern: PatternType
  seed: number
  iterations: number
  scale: number
  palette: string[]
  strokeWidth: number
  opacity: number
  bgColor: string
  rotation: number
}

export type PatternGenerator = (
  w: number, h: number, iterations: number, scale: number,
  palette: string[], rng: ReturnType<typeof createRng>, strokeWidth: number, opacity: number
) => string

/** 已实现的图案生成器（PatternType 中的 voronoi 尚无实现，故不在此处注册） */
export const PATTERN_GENERATORS: Record<string, PatternGenerator> = {
  spiral: generateSpiral,
  fractal: generateFractal,
  wave: generateWave,
  circles: generateCircles,
  noise: generateNoise,
}

/** 图案生成阶段：含种子随机数初始化与图案路径拼接，与 ArtCanvas 的调用完全一致 */
export function renderPattern(input: RenderInput): string {
  const rng = createRng(input.seed)
  const generator = PATTERN_GENERATORS[input.pattern]
  if (!generator) throw new Error(`未实现的图案类型: ${input.pattern}`)
  return generator(
    input.width, input.height, input.iterations, input.scale,
    input.palette, rng, input.strokeWidth, input.opacity
  )
}

/** SVG 组装阶段：背景、旋转容器与最终字符串拼接 */
export function wrapSvg(content: string, input: RenderInput): string {
  const { width, height, bgColor, rotation } = input
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${bgColor}"/>
  <g transform="rotate(${rotation},${width / 2},${height / 2})">${content}</g>
</svg>`
}

/** 完整生成：生成图案路径并组装为 SVG 字符串 */
export function renderSvg(input: RenderInput): string {
  return wrapSvg(renderPattern(input), input)
}
