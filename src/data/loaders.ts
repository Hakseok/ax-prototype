// Typed loaders for every mock file. File layout: docs/data-model.md.
import { readJson } from './reader';
import type {
  AiResultRecord, Alert, Claim, Collector, CollectorStatus, Customer, Delivery, DowntimeEvent, EnergyHourlyFile, EnergyQuarterFile,
  Equipment, Line, Lot, Manifest, Mold, Product, ProductionFile, Sensor, SensorHourlyFile, SensorMinuteFile, Site, User, WorkOrder
} from './types';

export const loadManifest = () => readJson<Manifest>('manifest.json');
export const loadSites = () => readJson<Site[]>('master/sites.json');
export const loadLines = () => readJson<Line[]>('master/lines.json');
export const loadEquipment = () => readJson<Equipment[]>('master/equipment.json');
export const loadSensors = () => readJson<Sensor[]>('master/sensors.json');
export const loadProducts = () => readJson<Product[]>('master/products.json');
export const loadMolds = () => readJson<Mold[]>('master/molds.json');
export const loadCustomers = () => readJson<Customer[]>('master/customers.json');
export const loadCollectors = () => readJson<Collector[]>('master/collectors.json');
export const loadUsers = () => readJson<User[]>('master/users.json');

export const loadProduction = (siteId: string) => readJson<ProductionFile>(`production/${siteId}.json`);
export const loadDowntime = (siteId: string) => readJson<DowntimeEvent[]>(`events/downtime-${siteId}.json`);
export const loadLots = (siteId: string, quarter: string) => readJson<Lot[]>(`lots/${siteId}-${quarter}.json`);
export const loadSensorHourly = (siteId: string) => readJson<SensorHourlyFile>(`sensors/hourly-${siteId}.json`);
export const loadSensorMinute = (equipmentId: string) => readJson<SensorMinuteFile>(`sensors/minute-${equipmentId}.json`);
export const loadWorkOrders = () => readJson<WorkOrder[]>('maintenance/work-orders.json');
export const loadClaims = () => readJson<Claim[]>('quality/claims.json');
export const loadDeliveries = () => readJson<Delivery[]>('quality/deliveries.json');
export const loadEnergyHourly = (siteId: string) => readJson<EnergyHourlyFile>(`energy/hourly-${siteId}.json`);
export const loadEnergyQuarter = (siteId: string) => readJson<EnergyQuarterFile>(`energy/quarter-${siteId}.json`);
export const loadAlerts = () => readJson<Alert[]>('events/alerts.json');
export const loadAiResults = () => readJson<AiResultRecord[]>('ai/results.json');
export const loadCollection = () => readJson<CollectorStatus[]>('events/collection.json');

/** Generic access for files without a dedicated loader (settings, histories). */
export const loadFile = <T>(path: string) => readJson<T>(path);
