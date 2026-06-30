const DEFAULT_PALETTE = [
  '#ff0000', // pure red
  '#00ff00', // pure lime
  '#0000ff', // pure blue
  '#ffff00', // pure yellow
  '#00ffff', // pure cyan
  '#ff00ff', // pure magenta
  '#ff8000', // orange
  '#8000ff', // violet
  '#00ff80', // spring green
  '#ff0080', // rose
  '#80ff00', // chartreuse
  '#0080ff', // azure
  '#ff4000', // vermilion
  '#00c0ff', // sky
  '#c000ff', // electric purple
  '#40ff00', // bright green
]

export function getLayerColor(layerName: string, overrides?: Record<string, string>): string {
  if (overrides?.[layerName]) return overrides[layerName]
  if (layerName === 'ratsnest') return '#ffffff'
  const hash = layerName.split('').reduce((h, c) => h + c.charCodeAt(0), 0)
  return DEFAULT_PALETTE[hash % DEFAULT_PALETTE.length]
}
