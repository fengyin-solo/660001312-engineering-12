import { useEffect, useRef } from 'react'
import { useDesignStore } from '../store/design'
import { renderSvg, type RenderInput } from '../generators/render'

export default function ArtCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const store = useDesignStore()

  useEffect(() => {
    const { width, height, pattern, seed, iterations, scale, palette,
      strokeWidth, opacity, bgColor, rotation } = store
    const input: RenderInput = {
      width, height, pattern, seed, iterations, scale, palette,
      strokeWidth, opacity, bgColor, rotation,
    }
    const svg = renderSvg(input)
    store.setSvgContent(svg)
    if (containerRef.current) {
      containerRef.current.innerHTML = svg
    }
  }, [store.pattern, store.seed, store.iterations, store.scale, store.rotation,
      store.strokeWidth, store.opacity, store.bgColor, store.palette, store.width, store.height])

  return (
    <div
      ref={containerRef}
      className="shadow-2xl rounded border border-gray-700"
      style={{ maxWidth: '100%', maxHeight: '100%', overflow: 'hidden' }}
    />
  )
}
