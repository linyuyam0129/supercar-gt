// 車款、烤漆、商店商品資料（車款皆為原創設計，非任何真實品牌車型）

export const PAINT_NAMES = ['競速紅', '閃電黃', '珍珠白', '曜石黑', '皇家藍', '賽道綠', '鈦灰', '烈焰橘'];
export const PAINTS = [
  [0.72, 0.02, 0.02], [0.95, 0.72, 0.02], [0.9, 0.9, 0.88], [0.02, 0.02, 0.025],
  [0.04, 0.14, 0.55], [0.03, 0.24, 0.12], [0.34, 0.35, 0.37], [0.95, 0.33, 0.02],
];

const base = {
  enginePitch: 1, wheelRadius: 0.34, frontTireWidth: 0.26, rearTireWidth: 0.30,
  bodyRoundness: 4, bodyTaper: 0.85, cabinRoundness: 2.6, cabinTaper: 0.7,
  rearGlassZ: -99, headLights: 'slim', tailLights: 'roundDouble', rims: 'fiveSpoke',
  rimColor: [0.78, 0.78, 0.8], caliperColor: [0.95, 0.75, 0.05], exhaustCount: 2,
  sideIntake: false, sideIntakeZ: 0, wing: false, wingZ: 0, wingY: 0, wingSpan: 1.7,
};

export const CARS = [
  {
    ...base, id: 'aurora', name: 'Aurora GT', subtitle: '中置引擎雙門跑車',
    description: '平衡的入門超跑，好開又穩定。', price: 0, defaultPaint: 0,
    topSpeedKmh: 260, engineForce: 11500, mass: 1450, grip: 1.4, downforce: 1.4, enginePitch: 1,
    wheelRadius: 0.34, frontAxleZ: 1.32, rearAxleZ: -1.33, fenderBulgeFront: 0.13, fenderBulgeRear: 0.1,
    bodyZ: [-2.22, -2.12, -1.85, -1.33, -0.75, -0.1, 0.6, 1.32, 1.85, 2.15, 2.28],
    bodyHalfWidth: [0.80, 0.94, 0.99, 1.00, 0.97, 0.95, 0.95, 0.97, 0.93, 0.80, 0.55],
    bodyBottom: [0.36, 0.22, 0.15, 0.14, 0.13, 0.12, 0.12, 0.13, 0.14, 0.16, 0.24],
    bodyTop: [0.80, 0.90, 0.93, 0.92, 0.88, 0.82, 0.74, 0.69, 0.62, 0.52, 0.40],
    cabinZ: [-1.95, -1.4, -0.85, -0.35, 0.05, 0.40, 0.62],
    cabinHalfWidth: [0.55, 0.70, 0.76, 0.78, 0.78, 0.76, 0.72],
    cabinTop: [0.95, 1.06, 1.15, 1.17, 1.12, 0.94, 0.78],
    windshieldTopZ: 0.0, sideGlassRearZ: -0.95, sideIntake: true, sideIntakeZ: -0.75,
    tailLights: 'roundDouble', rims: 'fiveSpoke', caliperColor: [0.95, 0.75, 0.05], exhaustCount: 2,
  },
  {
    ...base, id: 'saetta', name: 'Saetta Classica', subtitle: '1960 年代經典 GT',
    description: '優雅復古的長車頭跑車，輕巧靈活。', price: 6000, defaultPaint: 5,
    topSpeedKmh: 230, engineForce: 9000, mass: 1150, grip: 1.28, downforce: 0.8, enginePitch: 0.85,
    wheelRadius: 0.33, frontTireWidth: 0.21, rearTireWidth: 0.23,
    frontAxleZ: 1.30, rearAxleZ: -1.10, fenderBulgeFront: 0.14, fenderBulgeRear: 0.1,
    bodyZ: [-2.15, -2.02, -1.6, -1.1, -0.4, 0.3, 0.9, 1.3, 1.75, 2.05, 2.15],
    bodyHalfWidth: [0.62, 0.78, 0.84, 0.86, 0.82, 0.80, 0.80, 0.84, 0.80, 0.66, 0.45],
    bodyBottom: [0.36, 0.25, 0.18, 0.17, 0.16, 0.16, 0.16, 0.17, 0.19, 0.24, 0.30],
    bodyTop: [0.74, 0.84, 0.86, 0.84, 0.82, 0.80, 0.76, 0.72, 0.66, 0.56, 0.46],
    bodyRoundness: 2.8, bodyTaper: 0.8,
    cabinZ: [-1.80, -1.35, -0.95, -0.55, -0.2, 0.0, 0.18],
    cabinHalfWidth: [0.48, 0.60, 0.66, 0.67, 0.66, 0.64, 0.60],
    cabinTop: [0.90, 1.08, 1.20, 1.23, 1.18, 1.02, 0.86],
    cabinRoundness: 2.3, cabinTaper: 0.72,
    windshieldTopZ: -0.22, sideGlassRearZ: -1.0, rearGlassZ: -1.05,
    headLights: 'round', tailLights: 'roundSingle', rims: 'wire',
    rimColor: [0.85, 0.85, 0.87], caliperColor: [0.4, 0.4, 0.42], exhaustCount: 4,
  },
  {
    ...base, id: 'vento', name: 'Vento RS', subtitle: '前置 V12 豪華 GT',
    description: '長引擎蓋與強大馬力，直線速度驚人。', price: 15000, defaultPaint: 4,
    topSpeedKmh: 290, engineForce: 13500, mass: 1550, grip: 1.38, downforce: 1.5, enginePitch: 0.92,
    wheelRadius: 0.35, frontAxleZ: 1.50, rearAxleZ: -1.20, fenderBulgeFront: 0.12, fenderBulgeRear: 0.1,
    bodyZ: [-2.28, -2.16, -1.75, -1.2, -0.5, 0.2, 0.9, 1.5, 1.95, 2.22, 2.32],
    bodyHalfWidth: [0.80, 0.95, 1.00, 1.00, 0.96, 0.95, 0.96, 0.98, 0.93, 0.80, 0.56],
    bodyBottom: [0.36, 0.22, 0.15, 0.14, 0.13, 0.13, 0.13, 0.14, 0.15, 0.18, 0.25],
    bodyTop: [0.80, 0.92, 0.95, 0.93, 0.88, 0.82, 0.77, 0.72, 0.65, 0.55, 0.42],
    cabinZ: [-2.05, -1.55, -1.05, -0.6, -0.2, 0.05, 0.27],
    cabinHalfWidth: [0.55, 0.70, 0.76, 0.78, 0.77, 0.75, 0.70],
    cabinTop: [0.96, 1.10, 1.20, 1.22, 1.16, 1.00, 0.84],
    windshieldTopZ: -0.22, sideGlassRearZ: -1.1, rearGlassZ: -1.2,
    tailLights: 'bar', rims: 'fiveSpoke', rimColor: [0.18, 0.18, 0.2], caliperColor: [0.85, 0.05, 0.05], exhaustCount: 4,
  },
  {
    ...base, id: 'furia', name: 'Furia SF', subtitle: '賽道特化中置超跑',
    description: '大型尾翼帶來強大下壓力，過彎極快。', price: 28000, defaultPaint: 1,
    topSpeedKmh: 300, engineForce: 15500, mass: 1400, grip: 1.55, downforce: 2.2, enginePitch: 1.1,
    wheelRadius: 0.35, frontAxleZ: 1.30, rearAxleZ: -1.35, fenderBulgeFront: 0.15, fenderBulgeRear: 0.12,
    rearTireWidth: 0.32,
    bodyZ: [-2.25, -2.15, -1.85, -1.35, -0.75, -0.1, 0.6, 1.3, 1.85, 2.18, 2.30],
    bodyHalfWidth: [0.86, 0.99, 1.03, 1.03, 0.98, 0.96, 0.96, 0.99, 0.95, 0.82, 0.56],
    bodyBottom: [0.33, 0.20, 0.13, 0.12, 0.11, 0.11, 0.11, 0.12, 0.12, 0.14, 0.20],
    bodyTop: [0.78, 0.88, 0.90, 0.89, 0.84, 0.78, 0.71, 0.67, 0.60, 0.48, 0.34],
    bodyRoundness: 4.5, bodyTaper: 0.84,
    cabinZ: [-1.95, -1.4, -0.85, -0.35, 0.05, 0.40, 0.62],
    cabinHalfWidth: [0.52, 0.68, 0.74, 0.76, 0.76, 0.74, 0.70],
    cabinTop: [0.92, 1.02, 1.10, 1.12, 1.07, 0.90, 0.74],
    windshieldTopZ: 0.0, sideGlassRearZ: -0.9, sideIntake: true, sideIntakeZ: -0.8,
    wing: true, wingZ: -2.0, wingY: 1.18, wingSpan: 1.75,
    tailLights: 'bar', rims: 'fiveSpoke', rimColor: [0.05, 0.05, 0.06], caliperColor: [0.85, 0.05, 0.05], exhaustCount: 2,
  },
  {
    ...base, id: 'tempesta', name: 'Tempesta Hyper', subtitle: '油電混合極致超跑',
    description: '旗艦級性能，極速與加速皆為頂尖。', price: 60000, defaultPaint: 3,
    topSpeedKmh: 340, engineForce: 18500, mass: 1420, grip: 1.62, downforce: 2.6, enginePitch: 1.2,
    wheelRadius: 0.355, frontAxleZ: 1.38, rearAxleZ: -1.40, fenderBulgeFront: 0.2, fenderBulgeRear: 0.13,
    rearTireWidth: 0.33,
    bodyZ: [-2.40, -2.28, -1.9, -1.40, -0.8, -0.1, 0.6, 1.38, 1.9, 2.22, 2.35],
    bodyHalfWidth: [0.84, 0.98, 1.02, 1.03, 0.98, 0.95, 0.95, 0.99, 0.95, 0.82, 0.55],
    bodyBottom: [0.32, 0.18, 0.12, 0.11, 0.10, 0.10, 0.10, 0.11, 0.11, 0.13, 0.19],
    bodyTop: [0.80, 0.88, 0.89, 0.88, 0.82, 0.74, 0.66, 0.62, 0.56, 0.46, 0.33],
    bodyRoundness: 4.2, bodyTaper: 0.84,
    cabinZ: [-2.10, -1.5, -0.9, -0.4, 0.0, 0.35, 0.58],
    cabinHalfWidth: [0.45, 0.62, 0.72, 0.74, 0.74, 0.72, 0.66],
    cabinTop: [0.92, 1.00, 1.08, 1.10, 1.05, 0.88, 0.70],
    windshieldTopZ: -0.05, sideGlassRearZ: -0.95, sideIntake: true, sideIntakeZ: -0.85,
    wing: true, wingZ: -2.15, wingY: 1.10, wingSpan: 1.8,
    tailLights: 'bar', rims: 'tenSpoke', caliperColor: [0.95, 0.75, 0.05], exhaustCount: 2,
  },
];

for (const c of CARS) {
  c.frontZ = c.bodyZ[c.bodyZ.length - 1];
  c.rearZ = c.bodyZ[0];
  c.length = c.frontZ - c.rearZ;
  c.maxSpeed = c.topSpeedKmh / 3.6;
  c.zeroTo100 = Math.round(27.8 / (c.engineForce / c.mass) * 1.15 * 10) / 10;
  c.maxHalfWidth = Math.max(...c.bodyHalfWidth);
}

export const getCar = (id) => CARS.find((c) => c.id === id) || CARS[0];

// 商店商品（測試模式：不會實際扣款）
export const PRODUCTS = [
  { id: 'coins_s', title: '5,000 金幣', desc: '小額補給', price: 'NT$ 60', coins: 5000 },
  { id: 'coins_m', title: '18,000 金幣', desc: '多送 20%', price: 'NT$ 190', coins: 18000, badge: '熱門' },
  { id: 'coins_l', title: '50,000 金幣', desc: '多送 40%', price: 'NT$ 490', coins: 50000 },
  { id: 'coins_xl', title: '120,000 金幣', desc: '多送 60%', price: 'NT$ 990', coins: 120000, badge: '最划算' },
  { id: 'vip', title: 'VIP 通行證', desc: '永久解鎖所有車款 · 比賽金幣 ×2', price: 'NT$ 1,490', vip: true, badge: 'VIP' },
];

export const MISTAKES = {
  offtrack: { name: '偏離賽道', title: '偏離賽道', detail: '請回到路面', color: '#ff9a1a', priority: 1, speech: '偏離賽道，請回到路面',
    rumble: [[0.7, 0.15, 160, 70], [0.7, 0.15, 160, 70], [0.7, 0.15, 160, 0]] },
  wrongway: { name: '逆向行駛', title: '逆向行駛', detail: '請立即掉頭', color: '#ff2626', priority: 4, speech: '逆向行駛，請立即掉頭',
    rumble: [[0.35, 0.9, 350, 150], [0.35, 0.9, 350, 150], [0.35, 0.9, 350, 0]] },
  collision: { name: '碰撞', title: '發生碰撞', detail: '注意煞車點與走線', color: '#ff4033', priority: 3, speech: '發生碰撞',
    rumble: [[1, 1, 220, 0], [0.45, 0.2, 250, 0]] },
  spin: { name: '打滑', title: '車輛打滑', detail: '放開油門、反打方向盤', color: '#ffd926', priority: 2, speech: '車輛打滑，放開油門',
    rumble: [[0.9, 0.3, 120, 60], [0.7, 0.3, 120, 60], [0.5, 0.3, 120, 60], [0.3, 0.3, 120, 0]] },
  checkpoint: { name: '錯過檢查點', title: '錯過檢查點', detail: '罰時 +3 秒', color: '#bf59ff', priority: 2, speech: '錯過檢查點，罰時三秒',
    rumble: [[0.2, 0.75, 100, 100], [0.2, 0.75, 100, 0]] },
};
