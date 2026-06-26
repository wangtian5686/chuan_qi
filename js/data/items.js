/**
 * items.js — 物品配置表
 *
 * 涵盖《热血传奇》经典物品：
 * - 药水（红/蓝药、赎罪药水）
 * - 卷轴（回城卷轴）
 * - 各职业武器（木剑/铁剑/钢剑/屠龙刀/井中月/木杖/骨玉/龙纹剑）
 * - 防具（衣服/头盔/项链/戒指/手镯/腰带/靴子）
 * - 套装加成（圣战套/攻杀套）
 *
 * 约定：
 * - stats 字段为装备穿戴后叠加到角色属性的增量
 * - price 为NPC 卖价（玩家出售价 = price/2 由商店系统决定）
 * - 装备均有耐久度 durability，损坏后属性失效
 * - color 为无图渲染占位色，资源接入后由 icon 字段替换
 */

/**
 * 物品定义对象，键为物品 ID
 * @type {Record<string, object>}
 */
export const ITEMS = {
  // ==================== 药水 ====================
  hp_potion_small: {
    id: 'hp_potion_small',
    name: '小红药',
    type: 'potion',
    description: '恢复 50 点生命值',
    stackable: true,
    maxStack: 99,
    price: 100,
    effect: 'heal_hp',
    effectValue: 50,
    instant: true,
    icon: 'potion_red',
    color: '#d23030',
  },
  hp_potion_medium: {
    id: 'hp_potion_medium',
    name: '中红药',
    type: 'potion',
    description: '恢复 150 点生命值',
    stackable: true,
    maxStack: 99,
    price: 300,
    effect: 'heal_hp',
    effectValue: 150,
    instant: true,
    icon: 'potion_red',
    color: '#b01a1a',
  },
  hp_potion_large: {
    id: 'hp_potion_large',
    name: '大红药',
    type: 'potion',
    description: '恢复 400 点生命值',
    stackable: true,
    maxStack: 99,
    price: 800,
    effect: 'heal_hp',
    effectValue: 400,
    instant: true,
    icon: 'potion_red',
    color: '#7a0a0a',
  },
  mp_potion_small: {
    id: 'mp_potion_small',
    name: '小蓝药',
    type: 'potion',
    description: '恢复 50 点魔法值',
    stackable: true,
    maxStack: 99,
    price: 100,
    effect: 'heal_mp',
    effectValue: 50,
    instant: true,
    icon: 'potion_blue',
    color: '#3030d2',
  },
  mp_potion_medium: {
    id: 'mp_potion_medium',
    name: '中蓝药',
    type: 'potion',
    description: '恢复 150 点魔法值',
    stackable: true,
    maxStack: 99,
    price: 300,
    effect: 'heal_mp',
    effectValue: 150,
    instant: true,
    icon: 'potion_blue',
    color: '#1a1ab0',
  },
  mp_potion_large: {
    id: 'mp_potion_large',
    name: '大蓝药',
    type: 'potion',
    description: '恢复 400 点魔法值',
    stackable: true,
    maxStack: 99,
    price: 800,
    effect: 'heal_mp',
    effectValue: 400,
    instant: true,
    icon: 'potion_blue',
    color: '#0a0a7a',
  },
  cure_potion: {
    id: 'cure_potion',
    name: '赎罪药水',
    type: 'potion',
    description: '降低 100 点 PK 值，红名玩家赎罪专用',
    stackable: true,
    maxStack: 99,
    price: 5000,
    effect: 'cure_pk',
    effectValue: -100,
    instant: true,
    icon: 'potion_purple',
    color: '#7a30a0',
  },

  // ==================== 卷轴 ====================
  home_scroll: {
    id: 'home_scroll',
    name: '回城卷轴',
    type: 'scroll',
    description: '传送回最近的城市复活点',
    stackable: true,
    maxStack: 99,
    price: 200,
    effect: 'teleport_home',
    instant: true,
    icon: 'scroll_yellow',
    color: '#d8c060',
  },

  // ==================== 战士武器 ====================
  wooden_sword: {
    id: 'wooden_sword',
    name: '木剑',
    type: 'weapon',
    description: '入门级木制短剑，三职业通用',
    slot: 'weapon',
    classRestriction: null,
    stats: { minAtk: 1, maxAtk: 3 },
    durability: 20,
    maxDurability: 20,
    price: 100,
    icon: 'sword_wood',
    color: '#8a6a3a',
  },
  iron_sword: {
    id: 'iron_sword',
    name: '铁剑',
    type: 'weapon',
    description: '铁质长剑，攻击力尚可',
    slot: 'weapon',
    classRestriction: ['warrior'],
    levelRestriction: 5,
    stats: { minAtk: 3, maxAtk: 6 },
    durability: 30,
    maxDurability: 30,
    price: 1000,
    icon: 'sword_iron',
    color: '#9a9a9a',
  },
  steel_sword: {
    id: 'steel_sword',
    name: '钢剑',
    type: 'weapon',
    description: '精钢锻造，战士中坚装备',
    slot: 'weapon',
    classRestriction: ['warrior'],
    levelRestriction: 12,
    stats: { minAtk: 6, maxAtk: 10 },
    durability: 40,
    maxDurability: 40,
    price: 5000,
    icon: 'sword_steel',
    color: '#b0b0c0',
  },
  prairie_fire: {
    id: 'prairie_fire',
    name: '井中月',
    type: 'weapon',
    description: '井中捞月，锋利无匹，战士名剑',
    slot: 'weapon',
    classRestriction: ['warrior'],
    levelRestriction: 25,
    stats: { minAtk: 10, maxAtk: 20 },
    durability: 50,
    maxDurability: 50,
    price: 30000,
    icon: 'sword_prairie',
    color: '#c08060',
  },
  dragon_slayer: {
    id: 'dragon_slayer',
    name: '屠龙刀',
    type: 'weapon',
    description: '武林至尊，宝刀屠龙，号令天下，莫敢不从',
    slot: 'weapon',
    classRestriction: ['warrior'],
    levelRestriction: 35,
    stats: { minAtk: 15, maxAtk: 30 },
    durability: 60,
    maxDurability: 60,
    price: 100000,
    icon: 'sword_dragon',
    color: '#d0a020',
  },

  // ==================== 法师武器 ====================
  wooden_staff: {
    id: 'wooden_staff',
    name: '木杖',
    type: 'weapon',
    description: '入门级法杖，法师专用',
    slot: 'weapon',
    classRestriction: ['mage'],
    stats: { minMatk: 1, maxMatk: 3 },
    durability: 20,
    maxDurability: 20,
    price: 100,
    icon: 'staff_wood',
    color: '#6a5a3a',
  },
  bone_wand: {
    id: 'bone_wand',
    name: '骨玉',
    type: 'weapon',
    description: '沃玛教主掉落之骨玉法杖，魔法攻击极高',
    slot: 'weapon',
    classRestriction: ['mage'],
    levelRestriction: 25,
    stats: { minMatk: 5, maxMatk: 10 },
    durability: 50,
    maxDurability: 50,
    price: 30000,
    icon: 'wand_bone',
    color: '#e0e0d0',
  },
  dragon_sword: {
    id: 'dragon_sword',
    name: '龙纹剑',
    type: 'weapon',
    description: '刻有龙纹之剑，法师与道士通用',
    slot: 'weapon',
    classRestriction: ['mage', 'taoist'],
    levelRestriction: 30,
    stats: { minMatk: 8, maxMatk: 15 },
    durability: 55,
    maxDurability: 55,
    price: 50000,
    icon: 'sword_dragon_mage',
    color: '#4060a0',
  },

  // ==================== 衣服 ====================
  cloth_armor: {
    id: 'cloth_armor',
    name: '布衣',
    type: 'armor',
    description: '粗布缝制，聊胜于无',
    slot: 'armor',
    classRestriction: null,
    stats: { def: 1 },
    durability: 20,
    maxDurability: 20,
    price: 100,
    icon: 'armor_cloth',
    color: '#a09070',
  },
  leather_armor: {
    id: 'leather_armor',
    name: '皮衣',
    type: 'armor',
    description: '皮革制成，防御略强',
    slot: 'armor',
    classRestriction: null,
    levelRestriction: 5,
    stats: { def: 3 },
    durability: 30,
    maxDurability: 30,
    price: 800,
    icon: 'armor_leather',
    color: '#7a4a2a',
  },
  steel_armor: {
    id: 'steel_armor',
    name: '钢甲',
    type: 'armor',
    description: '精钢铠甲，防御坚固',
    slot: 'armor',
    classRestriction: null,
    levelRestriction: 15,
    stats: { def: 8 },
    durability: 45,
    maxDurability: 45,
    price: 5000,
    icon: 'armor_steel',
    color: '#8a8a98',
  },
  prairie_dress: {
    id: 'prairie_dress',
    name: '法神披风',
    type: 'armor',
    description: '法神遗物，附魔防御极高，法师专属',
    slot: 'armor',
    classRestriction: ['mage'],
    levelRestriction: 30,
    stats: { def: 15, mdef: 5 },
    durability: 50,
    maxDurability: 50,
    price: 30000,
    icon: 'armor_prairie',
    color: '#6030a0',
  },
  dragon_robe: {
    id: 'dragon_robe',
    name: '天魔神甲',
    type: 'armor',
    description: '天魔之甲，防御惊人，三职业顶级',
    slot: 'armor',
    classRestriction: null,
    levelRestriction: 35,
    stats: { def: 20, hp: 50 },
    durability: 60,
    maxDurability: 60,
    price: 80000,
    icon: 'armor_dragon',
    color: '#c02020',
  },

  // ==================== 头盔 ====================
  leather_helmet: {
    id: 'leather_helmet',
    name: '皮帽',
    type: 'helmet',
    description: '皮革头盔',
    slot: 'helmet',
    classRestriction: null,
    stats: { def: 1 },
    durability: 20,
    maxDurability: 20,
    price: 200,
    icon: 'helmet_leather',
    color: '#7a4a2a',
  },
  steel_helmet: {
    id: 'steel_helmet',
    name: '钢盔',
    type: 'helmet',
    description: '钢制头盔',
    slot: 'helmet',
    classRestriction: null,
    levelRestriction: 10,
    stats: { def: 3 },
    durability: 30,
    maxDurability: 30,
    price: 1500,
    icon: 'helmet_steel',
    color: '#8a8a98',
  },
  dragon_helmet: {
    id: 'dragon_helmet',
    name: '圣战头盔',
    type: 'helmet',
    description: '圣战套装之头盔',
    slot: 'helmet',
    classRestriction: null,
    levelRestriction: 30,
    stats: { def: 8, hp: 30 },
    durability: 50,
    maxDurability: 50,
    price: 30000,
    icon: 'helmet_dragon',
    color: '#c02020',
  },

  // ==================== 项链 ====================
  pearl_necklace: {
    id: 'pearl_necklace',
    name: '珍珠项链',
    type: 'necklace',
    description: '珍珠串成，增加 MP',
    slot: 'necklace',
    classRestriction: null,
    stats: { mp: 20 },
    durability: 25,
    maxDurability: 25,
    price: 500,
    icon: 'necklace_pearl',
    color: '#e0e0d0',
  },
  warrior_necklace: {
    id: 'warrior_necklace',
    name: '攻杀项链',
    type: 'necklace',
    description: '攻杀套装之项链，增加物理攻击',
    slot: 'necklace',
    classRestriction: ['warrior'],
    levelRestriction: 25,
    stats: { minAtk: 3, maxAtk: 5 },
    durability: 40,
    maxDurability: 40,
    price: 15000,
    icon: 'necklace_warrior',
    color: '#c06020',
  },
  dragon_necklace: {
    id: 'dragon_necklace',
    name: '圣战项链',
    type: 'necklace',
    description: '圣战套装之项链，魔法攻击与幸运加成',
    slot: 'necklace',
    classRestriction: null,
    levelRestriction: 30,
    stats: { minMatk: 3, maxMatk: 5, lucky: 1 },
    durability: 50,
    maxDurability: 50,
    price: 30000,
    icon: 'necklace_dragon',
    color: '#c02020',
  },

  // ==================== 戒指 ====================
  iron_ring: {
    id: 'iron_ring',
    name: '铁戒指',
    type: 'ring',
    description: '铁制戒指',
    slot: 'ring',
    classRestriction: null,
    stats: { def: 1 },
    durability: 20,
    maxDurability: 20,
    price: 200,
    icon: 'ring_iron',
    color: '#9a9a9a',
  },
  warrior_ring: {
    id: 'warrior_ring',
    name: '力量戒指',
    type: 'ring',
    description: '攻杀套装之戒指，增加物理攻击',
    slot: 'ring',
    classRestriction: ['warrior'],
    levelRestriction: 25,
    stats: { minAtk: 2, maxAtk: 4 },
    durability: 40,
    maxDurability: 40,
    price: 15000,
    icon: 'ring_warrior',
    color: '#c06020',
  },
  dragon_ring: {
    id: 'dragon_ring',
    name: '圣战戒指',
    type: 'ring',
    description: '圣战套装之戒指，魔法攻击与魔防加成',
    slot: 'ring',
    classRestriction: null,
    levelRestriction: 30,
    stats: { minMatk: 2, maxMatk: 3, mdef: 5 },
    durability: 50,
    maxDurability: 50,
    price: 30000,
    icon: 'ring_dragon',
    color: '#c02020',
  },
  paralyze_ring: {
    id: 'paralyze_ring',
    name: '麻痹戒指',
    type: 'ring',
    description: '攻击时 10% 概率使目标眩晕 1 秒',
    slot: 'ring',
    classRestriction: null,
    levelRestriction: 25,
    stats: {},
    special: 'paralyze_on_hit',
    specialChance: 0.10,
    specialDuration: 1,
    durability: 50,
    maxDurability: 50,
    price: 50000,
    icon: 'ring_paralyze',
    color: '#a0a0f0',
  },

  // ==================== 手镯 ====================
  iron_bracelet: {
    id: 'iron_bracelet',
    name: '铁手镯',
    type: 'bracelet',
    description: '铁制手镯',
    slot: 'bracelet',
    classRestriction: null,
    stats: { def: 1 },
    durability: 20,
    maxDurability: 20,
    price: 200,
    icon: 'bracelet_iron',
    color: '#9a9a9a',
  },
  warrior_bracelet: {
    id: 'warrior_bracelet',
    name: '攻杀手镯',
    type: 'bracelet',
    description: '攻杀套装之手镯，增加物理攻击',
    slot: 'bracelet',
    classRestriction: ['warrior'],
    levelRestriction: 25,
    stats: { minAtk: 2, maxAtk: 3 },
    durability: 40,
    maxDurability: 40,
    price: 15000,
    icon: 'bracelet_warrior',
    color: '#c06020',
  },
  dragon_bracelet: {
    id: 'dragon_bracelet',
    name: '圣战手镯',
    type: 'bracelet',
    description: '圣战套装之手镯，防御与生命加成',
    slot: 'bracelet',
    classRestriction: null,
    levelRestriction: 30,
    stats: { def: 5, hp: 30 },
    durability: 50,
    maxDurability: 50,
    price: 30000,
    icon: 'bracelet_dragon',
    color: '#c02020',
  },

  // ==================== 腰带 ====================
  leather_belt: {
    id: 'leather_belt',
    name: '皮腰带',
    type: 'belt',
    description: '皮革腰带',
    slot: 'belt',
    classRestriction: null,
    stats: { def: 1 },
    durability: 20,
    maxDurability: 20,
    price: 200,
    icon: 'belt_leather',
    color: '#7a4a2a',
  },
  steel_belt: {
    id: 'steel_belt',
    name: '钢腰带',
    type: 'belt',
    description: '钢制腰带，防御与生命加成',
    slot: 'belt',
    classRestriction: null,
    levelRestriction: 15,
    stats: { def: 3, hp: 20 },
    durability: 35,
    maxDurability: 35,
    price: 3000,
    icon: 'belt_steel',
    color: '#8a8a98',
  },
  dragon_belt: {
    id: 'dragon_belt',
    name: '圣战腰带',
    type: 'belt',
    description: '圣战套装之腰带，防御与生命加成',
    slot: 'belt',
    classRestriction: null,
    levelRestriction: 30,
    stats: { def: 5, hp: 50 },
    durability: 50,
    maxDurability: 50,
    price: 30000,
    icon: 'belt_dragon',
    color: '#c02020',
  },

  // ==================== 靴子 ====================
  leather_boots: {
    id: 'leather_boots',
    name: '皮靴',
    type: 'boots',
    description: '皮革靴子，提升闪避与移动速度',
    slot: 'boots',
    classRestriction: null,
    stats: { dodge: 2, moveSpeed: 0.5 },
    durability: 20,
    maxDurability: 20,
    price: 300,
    icon: 'boots_leather',
    color: '#7a4a2a',
  },
  steel_boots: {
    id: 'steel_boots',
    name: '钢靴',
    type: 'boots',
    description: '钢制靴子，防御与闪避兼得',
    slot: 'boots',
    classRestriction: null,
    levelRestriction: 15,
    stats: { dodge: 3, moveSpeed: 0.5, def: 2 },
    durability: 35,
    maxDurability: 35,
    price: 4000,
    icon: 'boots_steel',
    color: '#8a8a98',
  },
  dragon_boots: {
    id: 'dragon_boots',
    name: '圣战靴',
    type: 'boots',
    description: '圣战套装之靴，闪避与移动速度卓越',
    slot: 'boots',
    classRestriction: null,
    levelRestriction: 30,
    stats: { dodge: 5, moveSpeed: 1, def: 3 },
    durability: 50,
    maxDurability: 50,
    price: 30000,
    icon: 'boots_dragon',
    color: '#c02020',
  },
};

/**
 * 套装加成表
 * - items 为组成该套装所需的物品 ID 列表
 * - bonus 为穿戴齐整后激活的额外属性加成
 * 套加成的激活件数规则由 checkSetBonus 按套装定义判定
 */
export const SET_BONUS = {
  dragon: {
    name: '圣战套装',
    items: ['dragon_helmet', 'dragon_necklace', 'dragon_ring', 'dragon_bracelet', 'dragon_belt', 'dragon_boots', 'dragon_robe'],
    bonus: { def: 20, mdef: 15, hp: 100, mp: 50 },
  },
  warrior: {
    name: '攻杀套装',
    items: ['warrior_necklace', 'warrior_ring', 'warrior_bracelet'],
    bonus: { minAtk: 5, maxAtk: 8 },
  },
};

/**
 * 按 ID 取物品定义
 * @param {string} id 物品 ID
 * @returns {object|undefined} 物品定义（不存在则 undefined）
 */
export function getItem(id) {
  return ITEMS[id];
}

/**
 * 将物品的 stats 增量叠加到角色 stats 对象上
 * - 装备耐久为 0 时属性失效，由调用方在传入前过滤
 * - 直接修改传入的 stats，并返回其引用
 * @param {object} stats 角色属性对象（将被原地修改）
 * @param {object} item 物品定义
 * @returns {object} 叠加后的 stats
 */
export function applyItemStats(stats, item) {
  if (!item || !item.stats) return stats;
  for (const key of Object.keys(item.stats)) {
    stats[key] = (stats[key] || 0) + item.stats[key];
  }
  return stats;
}

/**
 * 检查当前已穿戴装备激活的套装加成
 * - 任一套装需要组成物品全部穿戴齐整才激活
 * @param {string[]} equippedItemIds 已穿戴装备的物品 ID 列表
 * @returns {Array<{setName: string, bonus: object}>} 激活的套装加成列表
 */
export function checkSetBonus(equippedItemIds) {
  const worn = new Set(equippedItemIds || []);
  const active = [];
  for (const [setId, def] of Object.entries(SET_BONUS)) {
    const complete = def.items.every((id) => worn.has(id));
    if (complete) {
      active.push({ setName: setId, bonus: def.bonus });
    }
  }
  return active;
}

export default ITEMS;
