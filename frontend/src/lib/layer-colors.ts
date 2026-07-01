// Palette optimized for distinguishability on a dark canvas, including for
// common color-vision deficiencies. Colors are spread across both hue and
// lightness so that adjacent layers are less likely to look the same.
const DEFAULT_PALETTE = [
  '#bb1d65',
  '#197769',
  '#876f12',
  '#277dc4',
  '#e84613',
  '#2693ac',
  '#31a51b',
  '#c374f6',
  '#f8767c',
  '#2fb7be',
  '#9fb923',
  '#adb0f9',
  '#fbae62',
  '#86cffa',
  '#3aea9d',
  '#fbc8ea',
]

// Common layer names are mapped to fixed, semantically distinct colors so the
// most important layers (top/bottom copper, silkscreen, etc.) are predictable.
const SEMANTIC_COLORS: [string, string][] = [
  ['ratsnest', '#00bfff'],
  ['outline', '#ffffff'],
  ['topcopper', '#e6194b'],
  ['toplayer', '#e6194b'],
  ['frontcopper', '#e6194b'],
  ['bottomcopper', '#1976d2'],
  ['bottomlayer', '#1976d2'],
  ['backcopper', '#1976d2'],
  // Do not map generic "inner" here; Inner1..InnerN should each get a
  // distinct palette color instead of all sharing the same orange.
  ['innercopper', '#ff9800'],
  ['topsilk', '#ffeb3b'],
  ['bottomsilk', '#fff59d'],
  ['topsoldermask', '#009688'],
  ['bottomsoldermask', '#4db6ac'],
  ['toppaste', '#9c27b0'],
  ['bottompaste', '#673ab7'],
  ['drill', '#b0bec5'],
]

function normalizeLayerName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export function getDefaultLayerColor(layerName: string, layerIndex: number): string {
  const normalized = normalizeLayerName(layerName)

  // Ratsnest gets its own fixed color instead of the rotating palette.
  if (normalized === 'ratsnest') return '#00bfff'

  for (const [key, color] of SEMANTIC_COLORS) {
    if (normalized.includes(key)) return color
  }

  // Fall back to the palette using the layer index so adjacent / numbered
  // layers (Inner1, Inner2, ...) always get distinct default colors.
  return DEFAULT_PALETTE[layerIndex % DEFAULT_PALETTE.length]
}

export function getLayerColor(layerName: string, overrides?: Record<string, string>): string {
  if (overrides?.[layerName]) return overrides[layerName]
  return getDefaultLayerColor(layerName, 0)
}
