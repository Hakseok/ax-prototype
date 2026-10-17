// Shapes of the mock data in public/mock (see scripts/gen-data and docs/data-model.md).

export type Permission = '조회' | '편집' | '관리';
export type RoleId = 'executive' | 'plant' | 'quality' | 'maintenance' | 'admin';
export type Grade = 'critical' | 'warning' | 'info';
export type ProcessKind = 'press' | 'welding' | 'injection' | 'painting' | 'machining' | 'assembly';
export type EnergySource = 'electricity' | 'compressedAir' | 'lng';
export type LossCategory = 'breakdown' | 'changeover' | 'minorStop' | 'speed' | 'defect' | 'startup';
export type Signal = 'vibration' | 'temperature' | 'current';

export interface Site {
  id: string;
  name: string;
  region: string;
  profile: string;
  shiftPattern: '3shift' | '2shift';
  energy: EnergySource[];
  contractPowerKw: number;
  order: number;
}

export interface Line {
  id: string;
  siteId: string;
  name: string;
  process: ProcessKind;
  machines: number;
  idealRatePerHour: number;
  /** Persons on the line per shift, used for overtime cost. */
  crew: number;
  /** Delivery-constrained line: a stop loses margin instead of being recovered with overtime (D-18). */
  constrained: boolean;
  /** Machines work side by side; a machine stop costs 1/machines of the line. */
  parallel: boolean;
  order: number;
}

export interface Equipment {
  id: string;
  siteId: string;
  lineId: string;
  name: string;
  type: string;
  monitored: boolean;
  collectorId: string;
  ratedKw: number;
  installedOn: string;
}

export interface Sensor {
  id: string;
  equipmentId: string;
  signal: Signal;
  name: string;
  unit: string;
  /** Normal operating range used by the rule alerts (not by the AI engine). */
  normal: [number, number];
}

export interface Product {
  id: string;
  name: string;
  siteId: string;
  lines: string[];
  customerId: string;
}

export interface Mold {
  id: string;
  siteId: string;
  lineId: string;
  productId: string;
  name: string;
  designShots: number;
}

export interface Customer {
  id: string;
  name: string;
}

export interface Collector {
  id: string;
  siteId: string;
  lineId: string;
  name: string;
  equipmentIds: string[];
}

export interface User {
  id: string;
  name: string;
  role: RoleId;
  permission: Permission;
  sites: string[];
  department: string;
}

/** One line × shift × product. Minutes are within the shift. */
export interface ShiftRecord {
  date: string;
  shift: string;
  siteId: string;
  lineId: string;
  productId: string;
  /** Calendar minutes of the shift for this product (split when two products share a shift). */
  calendarMin: number;
  plannedStopMin: number;
  /** Minutes without data (collection stopped); excluded from the OEE base. */
  missingMin: number;
  breakdownMin: number;
  changeoverMin: number;
  minorStopMin: number;
  minorStopCount: number;
  plannedQty: number;
  totalQty: number;
  goodQty: number;
  scrapQty: number;
  reworkQty: number;
  startupDefectQty: number;
  defects: Record<string, number>;
  /** True for the shift that is still running at "now". */
  running?: boolean;
}

export interface ProductionFile {
  siteId: string;
  /** Column names of `rows`, in order. */
  fields: (keyof ShiftRecord)[];
  rows: unknown[][];
}

export interface DowntimeEvent {
  id: string;
  siteId: string;
  lineId: string;
  equipmentId: string;
  start: string;
  end: string;
  category: Exclude<LossCategory, 'speed' | 'defect' | 'startup'>;
  causeCode: string;
  cause: string;
  shiftKey: string;
}

export interface Lot {
  id: string;
  siteId: string;
  lineId: string;
  productId: string;
  date: string;
  shift: string;
  equipmentId: string;
  moldId: string | null;
  materialLot: string;
  qty: number;
  defectQty: number;
  defects: Record<string, number>;
  /** param id -> [mean, min, max] */
  params: Record<string, [number, number, number]>;
  customerId: string;
  shippedOn: string | null;
  /** Units still in the plant warehouse. */
  stockQty: number;
}

export interface SensorHourlyFile {
  siteId: string;
  from: string;
  hours: number;
  scale: number;
  /** "equipmentId|signal" -> integers (value × scale), null = not received. */
  series: Record<string, (number | null)[]>;
}

export interface SensorMinuteFile {
  equipmentId: string;
  from: string;
  minutes: number;
  scale: number;
  series: Record<Signal, (number | null)[]>;
}

export interface WorkOrderLog {
  at: string;
  userId: string | null;
  action: string;
  note: string;
}

export interface WorkOrder {
  id: string;
  siteId: string;
  lineId: string;
  equipmentId: string;
  type: '예방' | '사후' | '예지';
  stage: '요청' | '승인' | '작업 중' | '완료' | '효과 확인';
  title: string;
  failureMode: string | null;
  requestedAt: string;
  requestedBy: string;
  approvedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  laborHours: number;
  partsKrw: number;
  aiResultId: string | null;
  /** For predictive orders: downtime the order avoided, from past failures of the same mode. */
  avoidedDowntimeMin: number | null;
  log: WorkOrderLog[];
}

export interface Claim {
  id: string;
  customerId: string;
  productId: string;
  siteId: string;
  receivedAt: string;
  defectType: string;
  qty: number;
  stage: '접수' | '원인 분석' | '대책' | '종결';
  title: string;
  lotIds: string[];
  costKrw: number;
  log: WorkOrderLog[];
}

export interface Delivery {
  date: string;
  siteId: string;
  productId: string;
  customerId: string;
  qty: number;
  shipments: number;
  lateShipments: number;
  returnedQty: number;
}

export interface EnergyHourlyFile {
  siteId: string;
  from: string;
  hours: number;
  /** storage integer = value × scale[source] */
  scale: Record<EnergySource, number>;
  /** "lineId|source" or "<siteId>-UTL|source" -> integers, null = not received. */
  series: Record<string, (number | null)[]>;
}

export interface EnergyQuarterFile extends Omit<EnergyHourlyFile, 'hours'> {
  slots: number;
}

export interface AlertLogEntry {
  at: string;
  userId: string | null;
  action: string;
  note: string;
}

export interface Alert {
  id: string;
  occurredAt: string;
  grade: Grade;
  source: '규칙' | 'AI' | '시스템';
  siteId: string;
  lineId: string | null;
  equipmentId: string | null;
  target: string;
  title: string;
  detail: string;
  value: number | null;
  threshold: number | null;
  unit: string;
  state: '미확인' | '확인' | '조치 완료';
  assignee: string | null;
  ackAt: string | null;
  closedAt: string | null;
  aiResultId: string | null;
  scenario: string | null;
  log: AlertLogEntry[];
}

export interface AiResultRecord {
  id: string;
  kind: 'anomaly' | 'health' | 'rul' | 'rootCause' | 'recommendation' | 'energyWaste';
  generatedAt: string;
  siteId: string;
  lineId: string | null;
  equipmentId: string | null;
  productId: string | null;
  level: Grade | null;
  confidence: number;
  conclusion: string;
  model: { name: string; version: string };
  decision: { value: '채택' | '기각'; reason: string; by: string; at: string } | null;
  scenario: string | null;
}

export interface CollectorStatus {
  collectorId: string;
  siteId: string;
  lineId: string;
  status: '정상' | '중단';
  lastSeen: string;
  missingFrom: string | null;
}

export interface UnitCostVersion {
  validFrom: string;
  changedAt: string;
  changedBy: string;
  note: string;
  values: Record<string, number>;
}

export interface Manifest {
  now: string;
  seed: number;
  production: { from: string; to: string };
  sensorHourly: { from: string; hours: number };
  energyHourly: { from: string; hours: number };
  energyQuarter: { from: string; slots: number };
  sites: string[];
  quarters: string[];
  files: number;
}
