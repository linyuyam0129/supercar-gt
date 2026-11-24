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
  driveFront: 0.5, rearGripBias: 1.12, retro: false, twoTone: null, twoToneY: 0,
};

// 超跑共用設定：低矮寬扁、腰線偏低、上半部內收、下半部近乎垂直
const hyper = {
  style: 'hyper', shoulder: 0.42, bodyRoundness: 3.2, bodyRoundnessLow: 7, bodyTaper: 0.78, bodyTuck: 0.95,
  cabinRoundness: 2.4, cabinTaper: 0.6, headLights: 'none', tailLights: 'none', rims: 'twinSpoke',
  rimColor: [0.16, 0.16, 0.17], caliperColor: [0.85, 0.05, 0.05], roof: 'paint', look: {},
};

export const CARS = [
  {
    ...base, ...hyper, id: 'aurora', name: 'Aurora GT', subtitle: '中置 V8 超跑',
    description: '平衡的入門超跑，好開又穩定。', price: 0, defaultPaint: 0,
    topSpeedKmh: 300, engineForce: 12500, mass: 1420, grip: 1.42, downforce: 1.4, enginePitch: 1,
    wheelRadius: 0.345, frontTireWidth: 0.25, rearTireWidth: 0.3,
    frontAxleZ: 1.33, rearAxleZ: -1.32, fenderBulgeFront: 0.11, fenderBulgeRear: 0.12,
    bodyZ: [-2.24, -2.14, -1.9, -1.32, -0.7, -0.05, 0.65, 1.33, 1.85, 2.14, 2.26],
    bodyHalfWidth: [0.90, 0.96, 0.99, 1.00, 0.97, 0.95, 0.96, 0.98, 0.96, 0.91, 0.80],
    bodyBottom: [0.34, 0.21, 0.13, 0.12, 0.11, 0.11, 0.11, 0.12, 0.12, 0.12, 0.14],
    bodyTop: [0.82, 0.88, 0.90, 0.88, 0.82, 0.74, 0.67, 0.64, 0.58, 0.50, 0.42],
    cabinZ: [-1.9, -1.4, -0.85, -0.35, 0.05, 0.42, 0.68],
    cabinHalfWidth: [0.42, 0.6, 0.7, 0.72, 0.72, 0.68, 0.6],
    cabinTop: [0.9, 1.02, 1.12, 1.15, 1.11, 0.95, 0.74],
    windshieldTopZ: 0.02, sideGlassRearZ: -0.9, exhaustCount: 2, rimColor: [0.75, 0.75, 0.78],
    caliperColor: [0.95, 0.75, 0.05],
  },
  {
    ...base, id: 'kaze', name: 'Kaze 85R', subtitle: '80 年代輕量後驅掀燈跑車',
    description: '輕巧的後輪驅動小跑車，車尾靈活好甩，靠走線征服山路。', price: 4000, defaultPaint: 2,
    topSpeedKmh: 200, engineForce: 7000, mass: 950, grip: 1.34, downforce: 0.3, enginePitch: 1.25,
    driveFront: 0, rearGripBias: 1.0, retro: true, twoTone: [0.03, 0.03, 0.035], twoToneY: 0.43,
    wheelRadius: 0.29, frontTireWidth: 0.19, rearTireWidth: 0.19,
    frontAxleZ: 1.22, rearAxleZ: -1.18, fenderBulgeFront: 0.03, fenderBulgeRear: 0.03,
    bodyZ: [-2.05, -1.98, -1.7, -1.18, -0.5, 0.2, 0.8, 1.22, 1.75, 2.05, 2.15],
    bodyHalfWidth: [0.78, 0.82, 0.83, 0.83, 0.83, 0.83, 0.83, 0.83, 0.82, 0.79, 0.72],
    bodyBottom: [0.32, 0.24, 0.2, 0.19, 0.18, 0.18, 0.18, 0.19, 0.2, 0.24, 0.3],
    bodyTop: [0.84, 0.88, 0.90, 0.89, 0.87, 0.85, 0.82, 0.76, 0.71, 0.66, 0.58],
    bodyRoundness: 6.5, bodyTaper: 0.9,
    cabinZ: [-1.80, -1.45, -1.0, -0.5, 0.0, 0.35, 0.62],
    cabinHalfWidth: [0.64, 0.69, 0.71, 0.72, 0.72, 0.70, 0.66],
    cabinTop: [0.95, 1.10, 1.24, 1.30, 1.29, 1.10, 0.88],
    cabinRoundness: 4, cabinTaper: 0.8,
    windshieldTopZ: 0.05, sideGlassRearZ: -1.35, rearGlassZ: -0.7,
    headLights: 'popup', tailLights: 'band', rims: 'tenSpoke',
    rimColor: [0.6, 0.6, 0.63], caliperColor: [0.18, 0.18, 0.2], exhaustCount: 1,
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
    ...base, ...hyper, id: 'vento', name: 'Vento RS', subtitle: '前置 V12 豪華 GT',
    description: '長引擎蓋與強大馬力，直線速度驚人。', price: 15000, defaultPaint: 4,
    topSpeedKmh: 330, engineForce: 14000, mass: 1580, grip: 1.4, downforce: 1.4, enginePitch: 0.9,
    wheelRadius: 0.35, frontAxleZ: 1.52, rearAxleZ: -1.2, fenderBulgeFront: 0.1, fenderBulgeRear: 0.12,
    bodyZ: [-2.3, -2.2, -1.8, -1.2, -0.5, 0.25, 0.95, 1.52, 1.98, 2.24, 2.36],
    bodyHalfWidth: [0.86, 0.94, 0.98, 0.99, 0.96, 0.95, 0.96, 0.98, 0.95, 0.9, 0.78],
    bodyBottom: [0.34, 0.22, 0.14, 0.13, 0.12, 0.12, 0.12, 0.13, 0.13, 0.13, 0.15],
    bodyTop: [0.8, 0.86, 0.88, 0.86, 0.8, 0.74, 0.7, 0.67, 0.62, 0.54, 0.46],
    shoulder: 0.46, bodyRoundness: 2.8,
    cabinZ: [-2.0, -1.55, -1.05, -0.6, -0.2, 0.1, 0.32],
    cabinHalfWidth: [0.5, 0.66, 0.73, 0.75, 0.74, 0.71, 0.64],
    cabinTop: [0.92, 1.08, 1.18, 1.2, 1.15, 0.98, 0.8],
    windshieldTopZ: -0.25, sideGlassRearZ: -1.15, rearGlassZ: -1.25, exhaustCount: 4,
    rimColor: [0.7, 0.7, 0.73], rims: 'fiveSpoke',
    look: { sideIntake: false, louvers: false, tail: 'ring', headBack: 0.4, headX: 0.7, grilleH: 0.65,
      extra: [{ plane: 'side', kind: 'vent', u: [0.75, 1.0], v: [0.38, 0.5], r: 0.05, skew: 0.2, range: [0.7, 9] }] },
  },
  {
    ...base, ...hyper, id: 'furia', name: 'Furia SF', subtitle: '賽道特化中置超跑',
    description: '大型尾翼帶來強大下壓力，過彎極快。', price: 28000, defaultPaint: 1,
    topSpeedKmh: 340, engineForce: 16000, mass: 1380, grip: 1.58, downforce: 2.3, enginePitch: 1.1,
    wheelRadius: 0.35, frontAxleZ: 1.3, rearAxleZ: -1.36, fenderBulgeFront: 0.14, fenderBulgeRear: 0.13, rearTireWidth: 0.33,
    bodyZ: [-2.28, -2.18, -1.9, -1.36, -0.75, -0.1, 0.6, 1.3, 1.85, 2.18, 2.32],
    bodyHalfWidth: [0.92, 0.99, 1.02, 1.03, 0.98, 0.95, 0.96, 0.99, 0.97, 0.93, 0.84],
    bodyBottom: [0.33, 0.2, 0.12, 0.11, 0.1, 0.1, 0.1, 0.11, 0.11, 0.11, 0.12],
    bodyTop: [0.8, 0.86, 0.88, 0.86, 0.8, 0.72, 0.64, 0.6, 0.53, 0.45, 0.37],
    cabinZ: [-1.95, -1.4, -0.85, -0.35, 0.05, 0.4, 0.62],
    cabinHalfWidth: [0.4, 0.58, 0.68, 0.7, 0.7, 0.66, 0.58],
    cabinTop: [0.86, 0.98, 1.07, 1.1, 1.06, 0.9, 0.7],
    windshieldTopZ: 0.0, sideGlassRearZ: -0.85, roof: 'carbon',
    wing: true, wingZ: -2.02, wingY: 1.18, wingSpan: 1.8, exhaustCount: 2,
    look: { tail: 'split', headSkew: 0.6, headW: 0.08 },
  },
  {
    ...base, ...hyper, id: 'tempesta', name: 'Tempesta Hyper', subtitle: '油電混合極致超跑',
    description: '旗艦級油電動力，極速與加速皆為頂尖。', price: 60000, defaultPaint: 3,
    topSpeedKmh: 370, engineForce: 21000, mass: 1500, grip: 1.62, downforce: 2.6, enginePitch: 1.2,
    wheelRadius: 0.355, frontAxleZ: 1.38, rearAxleZ: -1.4, fenderBulgeFront: 0.16, fenderBulgeRear: 0.13, rearTireWidth: 0.34,
    bodyZ: [-2.4, -2.28, -1.95, -1.4, -0.8, -0.1, 0.6, 1.38, 1.9, 2.22, 2.36],
    bodyHalfWidth: [0.92, 0.99, 1.02, 1.03, 0.98, 0.95, 0.96, 0.99, 0.97, 0.92, 0.8],
    bodyBottom: [0.32, 0.19, 0.11, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.11, 0.12],
    bodyTop: [0.8, 0.86, 0.87, 0.85, 0.78, 0.7, 0.62, 0.58, 0.51, 0.43, 0.35],
    cabinZ: [-2.1, -1.5, -0.9, -0.4, 0.0, 0.35, 0.58],
    cabinHalfWidth: [0.38, 0.56, 0.68, 0.7, 0.7, 0.66, 0.56],
    cabinTop: [0.86, 0.97, 1.06, 1.09, 1.04, 0.88, 0.68],
    windshieldTopZ: -0.05, sideGlassRearZ: -0.9, roof: 'carbon',
    wing: true, wingZ: -2.18, wingY: 1.08, wingSpan: 1.85, exhaustCount: 2, rims: 'aero',
    caliperColor: [0.95, 0.75, 0.05],
    look: { headSkew: 0.7, headW: 0.07, headLen: 0.24 },
  },
  {
    ...base, ...hyper, id: 'volta', name: 'Volta E-Hyper', subtitle: '四馬達純電超跑',
    description: '四顆電動馬達瞬間爆發，起步加速無人能敵。', price: 90000, defaultPaint: 6,
    topSpeedKmh: 410, engineForce: 34000, mass: 2150, grip: 1.6, downforce: 1.7, enginePitch: 1.7,
    wheelRadius: 0.36, frontAxleZ: 1.42, rearAxleZ: -1.33, fenderBulgeFront: 0.13, fenderBulgeRear: 0.15, rearTireWidth: 0.33,
    bodyZ: [-2.36, -2.26, -1.95, -1.33, -0.7, 0.0, 0.7, 1.42, 1.95, 2.26, 2.38],
    bodyHalfWidth: [0.9, 0.97, 1.0, 1.0, 0.96, 0.94, 0.95, 0.98, 0.96, 0.9, 0.78],
    bodyBottom: [0.34, 0.2, 0.12, 0.11, 0.11, 0.11, 0.11, 0.11, 0.11, 0.12, 0.13],
    bodyTop: [0.84, 0.9, 0.91, 0.88, 0.8, 0.72, 0.66, 0.63, 0.57, 0.48, 0.4],
    bodyRoundness: 2.7, bodyRoundnessLow: 6,
    cabinZ: [-2.0, -1.45, -0.9, -0.4, 0.05, 0.45, 0.72],
    cabinHalfWidth: [0.45, 0.62, 0.71, 0.73, 0.73, 0.69, 0.6],
    cabinTop: [0.92, 1.05, 1.15, 1.18, 1.14, 0.97, 0.76],
    windshieldTopZ: 0.05, sideGlassRearZ: -0.95, exhaustCount: 0, rims: 'aero',
    rimColor: [0.55, 0.56, 0.6], caliperColor: [0.1, 0.55, 0.95], accent: [0.1, 0.55, 0.95],
    look: { louvers: false, intakeZ: [-1.05, -0.45], intakeSkew: -0.1, headSkew: 0.5, headLen: 0.24, quad: false,
      extra: [{ plane: 'top', kind: 'accent', u: [-0.2, 0.3], v: [0.6, 0.62], r: 0, range: [0.5, 9] }] },
  },
  {
    ...base, ...hyper, id: 'vortex', name: 'Vortex GS', subtitle: '16 缸四渦輪 GT 超跑',
    description: '巨大馬力的豪華超跑，直線極速驚人。', price: 120000, defaultPaint: 4,
    topSpeedKmh: 420, engineForce: 30000, mass: 1990, grip: 1.55, downforce: 1.9, enginePitch: 0.95,
    wheelRadius: 0.36, frontAxleZ: 1.36, rearAxleZ: -1.36, fenderBulgeFront: 0.1, fenderBulgeRear: 0.14, rearTireWidth: 0.34,
    bodyZ: [-2.3, -2.2, -1.9, -1.36, -0.7, 0.0, 0.7, 1.36, 1.9, 2.2, 2.3],
    bodyHalfWidth: [0.92, 0.99, 1.02, 1.02, 0.98, 0.96, 0.97, 0.99, 0.97, 0.92, 0.8],
    bodyBottom: [0.34, 0.21, 0.13, 0.12, 0.11, 0.11, 0.11, 0.12, 0.12, 0.12, 0.13],
    bodyTop: [0.86, 0.92, 0.93, 0.9, 0.82, 0.75, 0.69, 0.66, 0.6, 0.52, 0.44],
    bodyRoundness: 2.6, bodyRoundnessLow: 6, shoulder: 0.44,
    cabinZ: [-1.95, -1.4, -0.85, -0.35, 0.05, 0.45, 0.72],
    cabinHalfWidth: [0.45, 0.62, 0.72, 0.74, 0.74, 0.7, 0.6],
    cabinTop: [0.95, 1.08, 1.18, 1.21, 1.17, 0.99, 0.78],
    windshieldTopZ: 0.05, sideGlassRearZ: -0.9, exhaustCount: 4, rims: 'twinSpoke',
    rimColor: [0.7, 0.7, 0.73], accent: [0.02, 0.03, 0.06],
    look: { grille: 'horseshoe', sideIntake: false, louvers: true, headSkew: 0.25, headW: 0.09, headLen: 0.18,
      extra: [
        // 側面大型弧形雙色區塊
        { plane: 'side', kind: 'accent', u: [-0.95, 0.35], v: [0.2, 0.86], r: 0.45, range: [0.6, 9] },
        { plane: 'side', kind: 'vent', u: [-0.72, -0.1], v: [0.32, 0.6], r: 0.12, range: [0.8, 9] },
        // 車頂中央脊線
        { plane: 'top', kind: 'accent', u: [-2.4, 2.4], v: [0, 0.02], r: 0, range: [0.4, 9] },
      ] },
  },
  {
    ...base, ...hyper, id: 'nordvind', name: 'Nordvind JX', subtitle: '北歐巨型尾翼極速超跑',
    description: '回力鏢造型尾翼與超輕車重，賽道與極速兼具。', price: 150000, defaultPaint: 7,
    topSpeedKmh: 430, engineForce: 25000, mass: 1420, grip: 1.72, downforce: 3.0, enginePitch: 1.25,
    wheelRadius: 0.355, frontAxleZ: 1.36, rearAxleZ: -1.38, fenderBulgeFront: 0.17, fenderBulgeRear: 0.14, rearTireWidth: 0.34,
    bodyZ: [-2.36, -2.24, -1.95, -1.38, -0.75, -0.05, 0.65, 1.36, 1.9, 2.2, 2.34],
    bodyHalfWidth: [0.94, 1.0, 1.02, 1.03, 0.98, 0.95, 0.96, 0.99, 0.97, 0.93, 0.82],
    bodyBottom: [0.32, 0.19, 0.11, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.11, 0.12],
    bodyTop: [0.82, 0.87, 0.88, 0.85, 0.78, 0.7, 0.62, 0.58, 0.51, 0.43, 0.35],
    cabinZ: [-2.0, -1.45, -0.9, -0.4, 0.02, 0.4, 0.66],
    cabinHalfWidth: [0.38, 0.56, 0.68, 0.71, 0.71, 0.67, 0.56],
    cabinTop: [0.88, 1.0, 1.1, 1.13, 1.09, 0.92, 0.7],
    windshieldTopZ: 0.0, sideGlassRearZ: -0.85, roof: 'carbon',
    wing: true, wingZ: -2.15, wingY: 1.26, wingSpan: 1.98, exhaustCount: 3, rims: 'aero',
    rimColor: [0.08, 0.08, 0.09], caliperColor: [0.95, 0.75, 0.05],
    look: { tail: 'split', headSkew: 0.15, headW: 0.11, headLen: 0.15, headBack: 0.32, intakeZ: [-1.15, -0.3], intakeSkew: -0.3,
      extra: [{ plane: 'top', kind: 'carbon', u: [0.2, 2.5], v: [0, 0.32], r: 0.05, range: [0.3, 9] }] },
  },
  {
    ...base, ...hyper, id: 'lunga', name: 'Corsa Lunga LR', subtitle: '長尾流線極速紀錄車',
    description: '水滴形長尾車身風阻極低，為極速紀錄而生。', price: 200000, defaultPaint: 2,
    topSpeedKmh: 455, engineForce: 23000, mass: 1350, grip: 1.48, downforce: 1.1, enginePitch: 1.15,
    wheelRadius: 0.35, frontAxleZ: 1.4, rearAxleZ: -1.45, fenderBulgeFront: 0.12, fenderBulgeRear: 0.1, rearTireWidth: 0.32,
    bodyZ: [-2.85, -2.7, -2.25, -1.45, -0.75, 0.0, 0.7, 1.4, 1.9, 2.22, 2.34],
    bodyHalfWidth: [0.62, 0.78, 0.94, 1.0, 0.97, 0.95, 0.96, 0.98, 0.96, 0.9, 0.78],
    bodyBottom: [0.4, 0.32, 0.17, 0.11, 0.1, 0.1, 0.1, 0.11, 0.11, 0.11, 0.12],
    bodyTop: [0.66, 0.72, 0.8, 0.84, 0.8, 0.72, 0.64, 0.6, 0.54, 0.45, 0.37],
    bodyRoundness: 2.5, bodyRoundnessLow: 5,
    cabinZ: [-2.5, -1.8, -1.1, -0.45, 0.05, 0.45, 0.72],
    cabinHalfWidth: [0.25, 0.5, 0.66, 0.7, 0.7, 0.66, 0.55],
    cabinTop: [0.8, 0.98, 1.08, 1.12, 1.08, 0.92, 0.7],
    cabinTaper: 0.55, windshieldTopZ: 0.05, sideGlassRearZ: -0.95, rearGlassZ: -1.0, exhaustCount: 2, rims: 'aero',
    rimColor: [0.82, 0.82, 0.85], caliperColor: [0.85, 0.05, 0.05], accent: [0.75, 0.55, 0.2],
    look: { louvers: false, tail: 'bar', intakeZ: [-1.2, -0.45], headSkew: 0.55, headLen: 0.24, headW: 0.08,
      extra: [{ plane: 'side', kind: 'accent', u: [-2.9, 2.4], v: [0.3, 0.315], r: 0, range: [0.5, 9] }] },
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

// 賽道（皆為原創設計）。control 為 [x, z, 高度]；mountain 類型有高低落差、窄路面與護欄 / 擋土牆
export const TRACKS = [
  {
    id: 'circuit', name: '綠野國際賽道', type: 'circuit', time: 'day', difficulty: 1, reward: 1,
    desc: '路面寬敞、緩衝區充足的國際賽道，適合熟悉車輛與練習。',
    scale: 1.45, halfWidth: 7.5,
    control: [
      [0, 0], [120, 0], [200, 10], [250, 60], [255, 130], [215, 190], [150, 205], [105, 170],
      [60, 120], [10, 140], [-40, 200], [-110, 215], [-170, 170], [-185, 95], [-150, 35], [-80, 5],
    ],
  },
  {
    id: 'kiri', name: '霧嶺山道', type: 'mountain', time: 'night', difficulty: 3, reward: 1.6,
    desc: '深夜山路。三個連續髮夾彎一路爬上山頂，再沿著 S 彎高速下山。',
    scale: 1, halfWidth: 4.6,
    control: [
      [-80, 0, 0], [-180, 0, 6], [-280, 0, 12], [-300, 6, 13.5], [-310, 22.5, 15], [-300, 39, 16.5],
      [-280, 45, 18], [-190, 45, 24], [-100, 45, 30], [-80, 51, 31.5], [-70, 67.5, 33], [-80, 84, 34.5],
      [-100, 90, 36], [-190, 90, 42], [-280, 90, 48], [-300, 96, 49.5], [-310, 112.5, 51], [-300, 129, 52.5],
      [-280, 135, 54], [-170, 135, 58], [-60, 135, 61], [0, 150, 62], [60, 140, 56.4], [120, 125, 50.6],
      [150, 90, 46.4], [130, 55, 42.7], [155, 20, 38.7], [195, 0, 34.5], [215, -35, 30.8], [195, -70, 27.1],
      [150, -80, 22.8], [80, -70, 16.3], [20, -55, 10.6], [-40, -25, 4.4],
    ],
  },
  {
    id: 'momiji', name: '楓谷峠', type: 'mountain', time: 'autumn', difficulty: 2, reward: 1.4,
    desc: '楓紅山谷中的連續 S 彎，高低落差大，考驗煞車點與走線。',
    scale: 1.15, halfWidth: 5,
    control: [
      [0, 0, 0], [80, -10, 3], [150, 10, 8], [200, -20, 12], [260, 0, 16], [300, 50, 20], [280, 100, 25],
      [240, 130, 29], [250, 180, 33], [300, 210, 37], [330, 260, 42], [290, 300, 46], [220, 290, 48],
      [170, 250, 47], [120, 270, 44], [60, 240, 40], [30, 190, 35], [-20, 170, 30], [-70, 165, 25],
      [-115, 135, 20], [-110, 85, 15], [-80, 55, 10], [-95, 20, 6], [-50, -8, 2],
    ],
  },
  {
    id: 'umikaze', name: '夕陽海岸線', type: 'mountain', time: 'dusk', difficulty: 2, reward: 1.5,
    desc: '沿著懸崖海岸的高速彎道，夕陽下翻越海岬山丘再滑回海邊。',
    scale: 1.1, halfWidth: 5, sea: { dir: [1, 0] },
    control: [
      [200, 0, 20], [260, 40, 21], [290, 110, 23], [270, 180, 24], [300, 250, 25], [280, 320, 26],
      [220, 360, 31], [150, 340, 36], [110, 290, 40], [60, 300, 43.5], [20, 350, 48], [-40, 330, 52],
      [-60, 260, 49], [-30, 210, 45.5], [-55, 160, 42], [-35, 110, 38.5], [-60, 60, 35], [-40, 10, 32],
      [30, -30, 28], [120, -40, 24],
    ],
  },
  {
    id: 'yukimine', name: '雪峰隘口', type: 'mountain', time: 'snow', difficulty: 3, reward: 1.8,
    desc: '白雪覆蓋的高山隘口。三個髮夾彎爬上稜線，再一路高速俯衝下山。',
    scale: 1.1, halfWidth: 4.8,
    control: [
      [0, 0, 0], [-100, 0, 5], [-200, 0, 10], [-222, 6, 11], [-232, 25, 12], [-222, 44, 13],
      [-200, 50, 14], [-100, 50, 19], [0, 50, 24], [22, 56, 25], [32, 75, 26], [22, 94, 27],
      [0, 100, 28], [-100, 100, 33], [-200, 100, 38], [-222, 106, 39], [-232, 125, 40], [-222, 144, 41],
      [-200, 150, 42], [-80, 150, 46], [30, 160, 49], [110, 200, 51], [180, 180, 51],
      [230, 120, 44.7], [215, 50, 38.9], [265, -10, 32.6], [255, -80, 26.9], [195, -125, 20.9],
      [115, -125, 14.4], [55, -95, 9], [15, -50, 4.2],
    ],
  },
  {
    id: 'sabaku', name: '沙漠極速環道', type: 'circuit', time: 'desert', difficulty: 1, reward: 1.2,
    desc: '兩條超長直線的沙漠高速賽道，盡情把極速拉到最高。',
    scale: 1.6, halfWidth: 8,
    control: [
      [0, 0], [110, 0], [220, 0], [310, 6], [375, 40], [395, 100], [365, 155], [300, 170], [240, 150],
      [195, 185], [170, 245], [110, 280], [0, 282], [-110, 280], [-200, 272], [-270, 245], [-300, 190],
      [-285, 125], [-255, 85], [-245, 40], [-190, 8], [-100, 0],
    ],
  },
];
// 聯賽對手（原創角色）
export const RIVALS = [
  { id: 'kai', name: '凱', title: '衛冕冠軍「黑豹」', car: 'nordvind', paint: 3 },
  { id: 'erica', name: '艾莉卡', title: '海岸線女王', car: 'vento', paint: 0 },
  { id: 'jin', name: '迅', title: '山道職人', car: 'furia', paint: 1 },
  { id: 'mona', name: '莫娜', title: '電動車工程師', car: 'volta', paint: 6 },
  { id: 'rei', name: '雷', title: '沙漠極速狂', car: 'vortex', paint: 4 },
  { id: 'aoi', name: '小葵', title: '新人同期', car: 'tempesta', paint: 5 },
];
export const getTrack = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];

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
