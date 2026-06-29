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
  shapeType: 'circle' | 'rect' | 'polygon' | 'path'
  params: number[]
}

export interface PinData {
  padstackName: string
  pinNumber: string
  x: number
  y: number
  rotation: number
}

export interface OutlineData {
  width: number
  corners: [number, number][]
}

export interface ImageData {
  name: string
  pins: PinData[]
  outlines: OutlineData[]
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
  images: ImageData[]
}

export interface LogEntry {
  timestamp: string
  type: 'Info' | 'Warn' | 'Error'
  message: string
  topic: string
}

export interface FRStatusData {
  status: 'loading' | 'not-installed' | 'ready' | 'error'
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
