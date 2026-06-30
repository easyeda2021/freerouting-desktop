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

export interface NetPinRef {
  refdes: string
  pinNumber: string
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
  netPins: Record<string, NetPinRef[]>
}

export type Lang = 'en' | 'zh'
export type DisplayUnit = 'mm' | 'mil'

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

export interface RoutingSettings {
  [key: string]: string | number | boolean | undefined
  max_passes?: number
  via_costs?: number
  plane_via_costs?: number
  start_ripup_costs?: number
  improvement_threshold?: number
  default_preferred_direction_trace_cost?: number
  default_undesired_direction_trace_cost?: number
  fanout_enabled?: boolean
  optimizer_enabled?: boolean
}

export interface NetInfo {
  name: string
  traceCount: number
  viaCount: number
  visible: boolean
  priority: number
}

export interface DrcViolation {
  type: string
  message: string
  netName?: string
  layer?: string
  x: number
  y: number
}

export interface SelectedObject {
  type: 'trace' | 'via' | 'component' | 'pad'
  id: string
  netName?: string
  refdes?: string
  pinNumber?: string
  layer?: string
}

export interface Measurement {
  start: [number, number] | null
  end: [number, number] | null
  cursor: [number, number] | null
  active: boolean
}
