export interface LayerInfo {
  name: string
  index: number
}

export interface TraceData {
  netName: string
  layer: string
  width: number
  corners: [number, number][]
}

export interface ViaData {
  netName: string
  padstackName: string
  center: [number, number]
  diameter: number
}

export interface ComponentData {
  refdes: string
  package: string
  location: [number, number]
  side: 'front' | 'back'
  rotation: number
}

export interface ShapeData {
  layer: string
  shapeType: 'circle' | 'rect' | 'polygon'
  params: number[]
}

export interface PadstackData {
  name: string
  shapes: ShapeData[]
}

export interface BoardData {
  resolutionUnit: string
  resolutionDenominator: number
  layers: LayerInfo[]
  traces: TraceData[]
  vias: ViaData[]
  components: ComponentData[]
  padstacks: PadstackData[]
}

export interface LogEntry {
  timestamp: string
  type: 'Info' | 'Warn' | 'Error'
  message: string
  topic: string
}

export interface JarStatusData {
  status: 'loading' | 'not-installed' | 'downloading' | 'ready' | 'error'
  version?: string
  progress: number
  message?: string
}

export interface JobStatus {
  id: string
  state: string
  stage: string
  currentPass: number
}
