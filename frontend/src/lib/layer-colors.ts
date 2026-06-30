const DEFAULT_PALETTE = [
  '#ff3333', // red
  '#33ff57', // green
  '#3366ff', // blue
  '#ffff33', // yellow
  '#ff33ff', // magenta
  '#ff9933', // orange
  '#33ffff', // cyan
  '#ff3380', // hot pink
  '#80ff33', // lime
  '#9933ff', // violet
  '#33ffcc', // turquoise
  '#ffcc33', // gold
  '#ff5733', // coral
  '#33a8ff', // azure
  '#c433ff', // electric purple
  '#33ff8d', // spring green
]

export function getLayerColor(layerName: string, overrides?: Record<string, string>): string {
  if (overrides?.[layerName]) return overrides[layerName]
  if (layerName === 'ratsnest') return '#ffffff'
  const hash = layerName.split('').reduce((h, c) => h + c.charCodeAt(0), 0)
  return DEFAULT_PALETTE[hash % DEFAULT_PALETTE.length]
}
