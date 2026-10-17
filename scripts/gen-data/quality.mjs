// Customer claims (SC-05) and daily deliveries, built from shipped lots.
import { C, DAY, GO_LIVE, NOW, date, parse, stream, write } from './lib.mjs';

export function buildQuality(master, production) {
  const r = stream('quality');
  const price = (p) => C.unitCosts.products[p].priceKrw;
  const shipped = production.lots.filter((l) => l.shippedOn);
  const byProduct = new Map();
  for (const l of shipped) {
    if (!byProduct.has(l.productId)) byProduct.set(l.productId, []);
    byProduct.get(l.productId).push(l);
  }

  // Claims: about 1.6 a month before go-live, 0.8 after; SC-05 on 2026-09-28.
  const claims = [];
  let seq = 0;
  const DEFECT = { 'HG-FSM-210': '너깃 불량', 'HG-DCM-120': '용접 누락', 'HG-RFB-330': '버', 'HG-FBC-410': '도막 두께 불량', 'HG-RBC-420': '색차', 'HG-DTR-510': '변형', 'HG-SKN-610': '치수 불량', 'HG-HHS-620': '표면 거칠기', 'HG-FEM-710': '체결 토크 불량', 'HG-CPM-720': '부품 누락' };
  const productIds = master.products.map((p) => p.id);
  for (let t = parse('2025-10-10'); t < parse('2026-09-20'); t += DAY) {
    const rate = (t < GO_LIVE ? 1.6 : 0.8) / 30;
    if (!r.chance(rate)) continue;
    const productId = r.pick(productIds);
    const candidates = (byProduct.get(productId) ?? []).filter((l) => parse(l.shippedOn) < t && parse(l.shippedOn) > t - 30 * DAY);
    if (!candidates.length) continue;
    const lot = r.pick(candidates);
    const qty = r.int(4, 40);
    const p = master.products.find((x) => x.id === productId);
    const recv = t + 9 * 3_600_000;
    const closed = recv + r.int(10, 25) * DAY;
    claims.push({
      id: `CLM-${date(t).slice(2).replace(/-/g, '')}-${String(++seq).padStart(2, '0')}`,
      customerId: p.customerId, productId, siteId: p.siteId, receivedAt: new Date(recv).toISOString().slice(0, 16), defectType: DEFECT[productId], qty,
      stage: closed < NOW ? '종결' : '대책', title: `${C.customers.find((c) => c.id === p.customerId).name} ${p.name} ${DEFECT[productId]}`, lotIds: [lot.id],
      costKrw: qty * price(productId) + C.unitCosts.claimHandlingKrwPerCase,
      log: [{ at: new Date(recv).toISOString().slice(0, 16), userId: null, action: '접수', note: `${qty}개 반품` }]
    });
  }
  // SC-05: weld nugget claim tracing back to three WD1 B-shift lots made near the tip dressing limit.
  const sc05Lots = production.lots.filter((l) => l.lineId === 'ASN-WD1' && l.equipmentId === 'ASN-WD1-M07' && l.date >= '2026-09-14' && l.date <= '2026-09-16' && l.shift === 'B');
  claims.push({
    id: 'CLM-260928-01', customerId: 'CUS-B', productId: 'HG-FSM-210', siteId: 'ASN', receivedAt: '2026-09-28T10:20', defectType: '너깃 불량', qty: 18,
    stage: '원인 분석', title: '고객사 B 프런트 사이드 멤버 용접 너깃 불량', lotIds: sc05Lots.map((l) => l.id),
    costKrw: 18 * price('HG-FSM-210') + C.unitCosts.claimHandlingKrwPerCase,
    log: [
      { at: '2026-09-28T10:20', userId: null, action: '접수', note: '고객사 B 조립 라인에서 18개 발견, 반품' },
      { at: '2026-09-28T13:40', userId: 'u-plant-asn', action: '원인 분석 시작', note: '로트 역추적 진행' }
    ],
    scenario: 'SC-05'
  });

  // Deliveries: shipped good units per product and day; late shipments drop after go-live.
  const deliveries = [];
  const byDay = new Map();
  for (const l of shipped) {
    const k = `${l.shippedOn}|${l.productId}`;
    byDay.set(k, (byDay.get(k) ?? 0) + l.qty - l.defectQty);
  }
  const returned = new Map(claims.map((c) => [`${c.receivedAt.slice(0, 10)}|${c.productId}`, c.qty]));
  for (const [k, qty] of [...byDay].sort()) {
    const [day, productId] = k.split('|');
    const p = master.products.find((x) => x.id === productId);
    const shipments = Math.max(1, Math.ceil(qty / (productId.startsWith('HG-FEM') || productId.startsWith('HG-CPM') ? 40 : 400)));
    const late = Math.min(shipments, r.poisson(shipments * (parse(day) < GO_LIVE ? 0.035 : 0.018)));
    deliveries.push({ date: day, siteId: p.siteId, productId, customerId: p.customerId, qty, shipments, lateShipments: late, returnedQty: returned.get(k) ?? 0 });
  }
  // Returns land on the claim day even without a shipment that day.
  for (const c of claims) {
    const k = `${c.receivedAt.slice(0, 10)}|${c.productId}`;
    if (!byDay.has(k)) deliveries.push({ date: c.receivedAt.slice(0, 10), siteId: c.siteId, productId: c.productId, customerId: c.customerId, qty: 0, shipments: 0, lateShipments: 0, returnedQty: c.qty });
  }
  deliveries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.productId < b.productId ? -1 : 1));
  claims.sort((a, b) => (a.receivedAt < b.receivedAt ? -1 : 1));
  write('quality/claims.json', claims);
  write('quality/deliveries.json', deliveries);
  return { claims, deliveries };
}
