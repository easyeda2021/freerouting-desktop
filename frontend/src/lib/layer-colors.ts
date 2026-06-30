const DEFAULT_PALETTE = [
  '#ff3b30', // red
  '#34c759', // green
  '#007aff', // blue
  '#ffcc00', // yellow
  '#af52de', // purple
  '#ff9500', // orange
  '#5ac8fa', // cyan
  '#ff2d55', // pink
  '#00c7be', // teal
  '#5856d6', // indigo
  '#ff6b22', // deep orange
  '#64d2ff', // sky
]

export function getLayerColor(layerName: string, overrides?: Record<string, string>): string {
  if (overrides?.[layerName]) return overrides[layerName]
  if (layerName === 'ratsnest') return '#ffffff'
  const hash = layerName.split('').reduce((h, c) => h + c.charCodeAt(0), 0)
  return DEFAULT_PALETTE[hash % DEFAULT_PALETTE.length]
}
