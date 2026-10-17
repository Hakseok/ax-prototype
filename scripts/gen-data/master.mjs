// Master data: sites, lines, equipment, sensors, products, molds, customers, collectors, users, unit costs.
import { C, stream, write } from './lib.mjs';

const pad = (n) => String(n).padStart(2, '0');

/** Lines whose machines work side by side; a machine stop costs 1/machines of the line. */
export const PARALLEL = new Set(['injection', 'machining']);

const machineName = (line, i) => {
  const n = i + 1;
  switch (line.id) {
    case 'ASN-PR1':
      return n === 1 ? '1,200톤 메인 프레스' : `800톤 프레스 ${n - 1}호`;
    case 'ASN-PR2':
      return '1,000톤 트랜스퍼 프레스';
    case 'GMH-IM1':
      return `${n <= 3 ? '3,000' : '2,500'}톤 사출기 ${n}호`;
    case 'GMH-IM2':
      return `1,300톤 사출기 ${n}호`;
    case 'GMH-PT1':
      return ['전처리 설비', '하도 부스', '상도 부스', '클리어 부스', '플라즈마 처리기', '건조로 1호', '건조로 2호', '도장 컨베이어'][i];
    case 'DGU-MC2':
      return n <= 8 ? `CNC 선반 ${n}호` : `머시닝센터 ${n - 8}호`;
    case 'HWS-AS1':
    case 'HWS-AS2': {
      const kinds = line.id === 'HWS-AS1' ? [10, 2, 1, 3] : [9, 2, 1, 2];
      if (n <= kinds[0]) return `체결 스테이션 ${n}호`;
      if (n <= kinds[0] + kinds[1]) return `비전 검사기 ${n - kinds[0]}호`;
      if (n <= kinds[0] + kinds[1] + kinds[2]) return 'EOL 시험기';
      return `AGV ${n - kinds[0] - kinds[1] - kinds[2]}호`;
    }
    default:
      return line.process === 'welding' ? `용접 로봇 ${n}호` : `머시닝센터 ${n}호`;
  }
};

const machineType = (line, name) => {
  if (name.includes('프레스')) return '프레스';
  if (name.includes('사출기')) return '사출기';
  if (name.includes('건조로')) return '건조로';
  if (name.includes('로봇')) return '용접 로봇';
  if (name.includes('선반') || name.includes('머시닝')) return '공작기계';
  if (name.includes('체결')) return '체결기';
  if (name.includes('검사기') || name.includes('시험기')) return '검사 장비';
  if (name.includes('AGV')) return '물류 장비';
  return line.process === 'painting' ? '도장 설비' : '생산 설비';
};

const ratedKwOf = (type, line) =>
  ({ 프레스: line.id === 'ASN-PR1' ? 220 : 160, 사출기: line.id === 'GMH-IM1' ? 250 : 110, 건조로: 90, '용접 로봇': 25, 공작기계: 30, 체결기: 4, '검사 장비': 6, '물류 장비': 3, '도장 설비': 45 })[type] ?? 20;

const UTILITY_NAMES = ['공기 압축기 1호', '공기 압축기 2호', '공기 압축기 3호', '공기 압축기 4호', '공기 건조기', '수전 변압기', '냉각탑', '냉동기', '천장 크레인 1호', '천장 크레인 2호', '집진기', '배기 팬', '냉각수 펌프', '금형 온조기', '보일러', '지게차 충전기', '비상 발전기', '소방 펌프'];

export function buildMaster() {
  const r = stream('master');
  const sites = C.sites.map((s, i) => ({
    id: s.id, name: s.name, region: s.region, profile: s.profile, shiftPattern: s.shiftPattern, energy: s.energy,
    contractPowerKw: s.contractPowerKw, order: i + 1
  }));
  const lines = C.sites.flatMap((s) =>
    s.lines.map((l, i) => ({
      id: l.id, siteId: s.id, name: l.name, process: l.process, machines: l.machines, idealRatePerHour: l.idealRatePerHour,
      crew: l.crew, constrained: l.constrained, parallel: PARALLEL.has(l.process), order: i + 1
    }))
  );

  // Equipment: line machines, then site utilities up to the site's equipment count.
  const equipment = [];
  for (const s of C.sites) {
    for (const l of s.lines) {
      for (let i = 0; i < l.machines; i++) {
        const name = machineName(l, i);
        const type = machineType(l, name);
        equipment.push({
          id: `${l.id}-M${pad(i + 1)}`, siteId: s.id, lineId: l.id, name, type, monitored: false, collectorId: '',
          ratedKw: ratedKwOf(type, l), installedOn: `20${r.int(12, 22)}-${pad(r.int(1, 12))}-${pad(r.int(1, 28))}`
        });
      }
    }
    const lineCount = s.lines.reduce((a, l) => a + l.machines, 0);
    for (let i = 0; i < s.counts.equipment - lineCount; i++) {
      const name = UTILITY_NAMES[i];
      equipment.push({
        id: `${s.id}-UTL-M${pad(i + 1)}`, siteId: s.id, lineId: `${s.id}-UTL`, name, type: name.includes('압축기') ? '공기 압축기' : '유틸리티 설비',
        monitored: false, collectorId: '', ratedKw: name.includes('압축기') ? 160 : 40, installedOn: `20${r.int(10, 20)}-${pad(r.int(1, 12))}-${pad(r.int(1, 28))}`
      });
    }
  }

  // Monitoring: big rotating machines first, up to the site's monitored count.
  const priority = { 프레스: 1, 건조로: 2, 사출기: 3, '공기 압축기': 4, 공작기계: 5, '용접 로봇': 6, 체결기: 7, '도장 설비': 8 };
  for (const s of C.sites) {
    const list = equipment.filter((e) => e.siteId === s.id).sort((a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9) || (a.id < b.id ? -1 : 1));
    list.slice(0, s.counts.monitored).forEach((e) => (e.monitored = true));
  }

  // Collectors: one per line (two on DGU-MC2 so SC-07 can stop four machines), one for utilities.
  const collectors = [];
  for (const s of C.sites) {
    for (const l of [...s.lines.map((x) => x.id), `${s.id}-UTL`]) {
      const eqs = equipment.filter((e) => e.lineId === l);
      const groups = l === 'DGU-MC2' ? [eqs.slice(0, eqs.length - 4), eqs.slice(-4)] : [eqs];
      groups.forEach((g, gi) => {
        const id = `COL-${l}${groups.length > 1 ? `-${gi + 1}` : ''}`;
        collectors.push({ id, siteId: s.id, lineId: l, name: `${l.endsWith('UTL') ? '유틸리티' : lines.find((x) => x.id === l).name} 수집 장치${groups.length > 1 ? ` ${gi + 1}` : ''}`, equipmentIds: g.map((e) => e.id) });
        g.forEach((e) => (e.collectorId = id));
      });
    }
  }

  const sensorDefs = {
    vibration: { name: '진동 RMS', unit: 'mm/s', normal: [1.5, 4.5] },
    temperature: { name: '베어링 온도', unit: '℃', normal: [35, 62] },
    current: { name: '모터 전류', unit: 'A', normal: [0, 0] }
  };
  const sensors = equipment
    .filter((e) => e.monitored)
    .flatMap((e) =>
      Object.entries(sensorDefs).map(([signal, d]) => ({
        id: `${e.id}-${signal.slice(0, 3).toUpperCase()}`,
        equipmentId: e.id,
        signal,
        name: e.type === '건조로' && signal === 'temperature' ? '로내 온도' : d.name,
        unit: d.unit,
        normal: signal === 'current' ? [Math.round(e.ratedKw * 0.9), Math.round(e.ratedKw * 1.6)] : e.type === '건조로' && signal === 'temperature' ? [132, 148] : d.normal
      }))
    );

  const products = C.sites.flatMap((s) => s.products.map((p) => ({ id: p.id, name: p.name, siteId: s.id, lines: p.lines, customerId: p.customer })));
  const moldPlan = { 'HG-FSM-210': 8, 'HG-DCM-120': 8, 'HG-RFB-330': 6, 'HG-FBC-410': 4, 'HG-RBC-420': 2, 'HG-DTR-510': 10 };
  const molds = products.flatMap((p) =>
    Array.from({ length: moldPlan[p.id] ?? 0 }, (_, i) => ({
      id: `MLD-${p.id.slice(3, 6)}-${pad(i + 1)}`,
      siteId: p.siteId,
      lineId: p.lines[0],
      productId: p.id,
      name: `${p.name} ${p.siteId === 'ASN' ? '금형' : '사출 금형'} ${i + 1}호`,
      designShots: p.siteId === 'ASN' ? 300000 : 500000
    }))
  );
  const customers = C.customers.map((c) => ({ id: c.id, name: c.name }));
  const departments = { executive: '경영진', plant: '아산공장', quality: '김해공장 품질팀', maintenance: '설비기술팀', admin: '정보전략팀' };
  const users = C.users.map((u) => ({ ...u, department: departments[u.role] }));

  // Unit costs as versioned items (SET-020).
  const uc = C.unitCosts;
  const item = (id, name, unit, group, value) => ({ id, name, unit, group, value, versions: [{ validFrom: C.dataPeriod.production.from, value, changedAt: '2025-09-25T10:00', changedBy: 'u-admin', note: '초기 설정 (시연용)' }] });
  const unitCosts = {
    demoOnly: true,
    items: [
      item('electricityKrwPerKwh', '전력 단가', '원/kWh', '에너지', uc.electricityKrwPerKwh),
      item('compressedAirKrwPerNm3', '압축공기 원가', '원/Nm³', '에너지', uc.compressedAirKrwPerNm3),
      item('lngKrwPerNm3', 'LNG 단가', '원/Nm³', '에너지', uc.lngKrwPerNm3),
      item('maintenanceLaborKrwPerHour', '정비 인건비', '원/시간', '인건비', uc.maintenanceLaborKrwPerHour),
      item('overtimeLaborKrwPerHour', '잔업 인건비', '원/시간', '인건비', uc.overtimeLaborKrwPerHour),
      item('claimHandlingKrwPerCase', '클레임 처리비', '원/건', '품질', uc.claimHandlingKrwPerCase),
      ...lines.map((l) => item(`lineLoss.${l.id}`, `${l.name} 정지 손실`, '원/시간', '라인 손실', uc.lineLossKrwPerHour[l.id])),
      ...products.flatMap((p) => [
        item(`material.${p.id}`, `${p.name} 재료비`, '원/개', '제품 원가', uc.products[p.id].materialKrw),
        item(`conversion.${p.id}`, `${p.name} 가공비`, '원/개', '제품 원가', uc.products[p.id].conversionKrw),
        item(`rework.${p.id}`, `${p.name} 재작업비`, '원/개', '제품 원가', uc.products[p.id].reworkKrw),
        item(`price.${p.id}`, `${p.name} 판매가`, '원/개', '제품 원가', uc.products[p.id].priceKrw)
      ])
    ]
  };
  const axSettings = { baseline: C.ax.baseline, goLive: C.ax.goLive, investment: C.ax.investment, industryTemplate: C.company.industryTemplate };

  write('master/sites.json', sites);
  write('master/lines.json', lines);
  write('master/equipment.json', equipment);
  write('master/sensors.json', sensors);
  write('master/products.json', products);
  write('master/molds.json', molds);
  write('master/customers.json', customers);
  write('master/collectors.json', collectors);
  write('master/users.json', users);
  write('master/unit-costs.json', unitCosts);
  write('master/ax-settings.json', axSettings);
  return { sites, lines, equipment, sensors, products, molds, customers, collectors, users };
}
