const DEFAULT_PALETTE = ['#e94560', '#0f3460', '#16c79a', '#f5a623', '#a855f7', '#06b6d4', '#84cc16', '#ec4899']

export function getLayerColor(layerName: string, overrides?: Record<string, string>): string {
  if (overrides?.[layerName]) return overrides[layerName]
  const hash = layerName.split('').reduce((h, c) => h + c.charCodeAt(0), 0)
  return DEFAULT_PALETTE[hash % DEFAULT_PALETTE.length]
}
