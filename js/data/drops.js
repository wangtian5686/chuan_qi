/**
 * drops.js — 怪物掉落配置表
 *
 * 为 monsters.js 中定义的全部怪物提供掉落表，并实现摇奖。
 *
 * 掉落表条目格式：
 *   { type: 'gold',        chance, min, max }                     // 金币，区间 [min,max]
 *   { type: 'item',        chance, itemId, count }                // 单个物品
 *   { type: 'item_group',  chance, items: [...], count }          // 从 items 中随机选 count 个（不重复）
 *
 * 扩展字段（用于 BOSS 必掉多件装备）：
 *   countRange: [min, max]  // 命中后掉落数量在区间内随机，优先于 count
 *
 * 设计原则：
 * - 金币条目 chance=1.0 表示必掉金币，区间与 monsters.js 的 goldRange 一致
 * - 低级怪：小红药、木剑、铁戒指等新手装备，掉率低
 * - 中级怪：中红/中蓝、钢剑、钢甲等中阶装备
 * - 高级怪：大红/大蓝、钢剑、骨玉等，少量高阶装备
 * - BOSS：必掉金币 + 必掉多件装备（item_group，chance=1.0）
 *   · 沃玛教主：必掉 1-3 件中阶装备（骨玉/龙纹剑/井中月/法神披风）
 *   · 祖玛教主：必掉 2-4 件高阶装备（含圣战套件之一）
 *   · 赤月恶魔：必掉 3-5 件顶级装备（屠龙刀/天魔神甲/麻痹戒等）
 *
 * 物品 ID 与 items.js 对应。
 */

/**
 * 掉落表对象，键为怪物 ID，值为掉落条目数组
 * @type {Record<string, Array<object>>}
 */
export const DROPS = {
  // ==================== 低等级（新手村附近） ====================
  duogou_cat: [
    { type: 'gold', chance: 1.0, min: 2, max: 8 },
    { type: 'item', itemId: 'hp_potion_small', chance: 0.25, count: 1 },
    { type: 'item', itemId: 'wooden_sword', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'iron_ring', chance: 0.01, count: 1 },
    { type: 'item', itemId: 'cloth_armor', chance: 0.01, count: 1 },
  ],
  dingba_cat: [
    { type: 'gold', chance: 1.0, min: 3, max: 10 },
    { type: 'item', itemId: 'hp_potion_small', chance: 0.3, count: 1 },
    { type: 'item', itemId: 'wooden_sword', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'iron_ring', chance: 0.01, count: 1 },
    { type: 'item', itemId: 'leather_helmet', chance: 0.01, count: 1 },
  ],
  dao_cat: [
    { type: 'gold', chance: 1.0, min: 5, max: 12 },
    { type: 'item', itemId: 'hp_potion_small', chance: 0.3, count: 1 },
    { type: 'item', itemId: 'iron_sword', chance: 0.015, count: 1 },
    { type: 'item', itemId: 'iron_ring', chance: 0.01, count: 1 },
    { type: 'item', itemId: 'leather_armor', chance: 0.01, count: 1 },
  ],
  hook_cat: [
    { type: 'gold', chance: 1.0, min: 5, max: 15 },
    { type: 'item', itemId: 'hp_potion_small', chance: 0.3, count: 1 },
    { type: 'item', itemId: 'mp_potion_small', chance: 0.2, count: 1 },
    { type: 'item', itemId: 'iron_sword', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'iron_bracelet', chance: 0.01, count: 1 },
  ],
  black_pig: [
    { type: 'gold', chance: 1.0, min: 10, max: 30 },
    { type: 'item', itemId: 'hp_potion_small', chance: 0.35, count: 1 },
    { type: 'item', itemId: 'iron_sword', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'leather_armor', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'iron_ring', chance: 0.015, count: 1 },
  ],
  red_pig: [
    { type: 'gold', chance: 1.0, min: 15, max: 40 },
    { type: 'item', itemId: 'hp_potion_small', chance: 0.35, count: 1 },
    { type: 'item', itemId: 'mp_potion_small', chance: 0.25, count: 1 },
    { type: 'item', itemId: 'iron_sword', chance: 0.025, count: 1 },
    { type: 'item', itemId: 'leather_boots', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'steel_helmet', chance: 0.005, count: 1 },
  ],

  // ==================== 中等级（沃玛寺庙/盟重省） ====================
  woma_guard: [
    { type: 'gold', chance: 1.0, min: 30, max: 80 },
    { type: 'item', itemId: 'hp_potion_medium', chance: 0.4, count: 1 },
    { type: 'item', itemId: 'mp_potion_medium', chance: 0.3, count: 1 },
    { type: 'item', itemId: 'steel_sword', chance: 0.03, count: 1 },
    { type: 'item', itemId: 'steel_armor', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'steel_helmet', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'home_scroll', chance: 0.05, count: 1 },
  ],
  woma_warrior: [
    { type: 'gold', chance: 1.0, min: 40, max: 100 },
    { type: 'item', itemId: 'hp_potion_medium', chance: 0.4, count: 1 },
    { type: 'item', itemId: 'mp_potion_medium', chance: 0.3, count: 1 },
    { type: 'item', itemId: 'steel_sword', chance: 0.035, count: 1 },
    { type: 'item', itemId: 'steel_armor', chance: 0.025, count: 1 },
    { type: 'item', itemId: 'warrior_ring', chance: 0.005, count: 1 },
  ],
  woma_priest: [
    { type: 'gold', chance: 1.0, min: 40, max: 100 },
    { type: 'item', itemId: 'mp_potion_medium', chance: 0.45, count: 1 },
    { type: 'item', itemId: 'hp_potion_medium', chance: 0.35, count: 1 },
    { type: 'item', itemId: 'pearl_necklace', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'steel_belt', chance: 0.02, count: 1 },
    { type: 'item', itemId: 'bone_wand', chance: 0.003, count: 1 },
  ],
  flame_pig: [
    { type: 'gold', chance: 1.0, min: 50, max: 120 },
    { type: 'item', itemId: 'hp_potion_medium', chance: 0.45, count: 1 },
    { type: 'item', itemId: 'mp_potion_medium', chance: 0.35, count: 1 },
    { type: 'item', itemId: 'steel_sword', chance: 0.035, count: 1 },
    { type: 'item', itemId: 'steel_boots', chance: 0.025, count: 1 },
    { type: 'item', itemId: 'steel_armor', chance: 0.02, count: 1 },
  ],
  bow_man: [
    { type: 'gold', chance: 1.0, min: 40, max: 100 },
    { type: 'item', itemId: 'hp_potion_medium', chance: 0.4, count: 1 },
    { type: 'item', itemId: 'mp_potion_medium', chance: 0.3, count: 1 },
    { type: 'item', itemId: 'steel_sword', chance: 0.03, count: 1 },
    { type: 'item', itemId: 'steel_helmet', chance: 0.025, count: 1 },
    { type: 'item', itemId: 'warrior_bracelet', chance: 0.005, count: 1 },
  ],

  // ==================== 高等级（祖玛阁/赤月峡谷） ====================
  zuma_guard: [
    { type: 'gold', chance: 1.0, min: 100, max: 250 },
    { type: 'item', itemId: 'hp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'mp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'steel_sword', chance: 0.05, count: 1 },
    { type: 'item', itemId: 'steel_armor', chance: 0.04, count: 1 },
    { type: 'item', itemId: 'steel_belt', chance: 0.03, count: 1 },
    { type: 'item', itemId: 'bone_wand', chance: 0.005, count: 1 },
  ],
  zuma_archer: [
    { type: 'gold', chance: 1.0, min: 120, max: 280 },
    { type: 'item', itemId: 'hp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'mp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'steel_sword', chance: 0.05, count: 1 },
    { type: 'item', itemId: 'steel_boots', chance: 0.04, count: 1 },
    { type: 'item', itemId: 'warrior_ring', chance: 0.008, count: 1 },
  ],
  black_spider: [
    { type: 'gold', chance: 1.0, min: 100, max: 250 },
    { type: 'item', itemId: 'hp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'mp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'steel_sword', chance: 0.05, count: 1 },
    { type: 'item', itemId: 'steel_belt', chance: 0.04, count: 1 },
    { type: 'item', itemId: 'iron_bracelet', chance: 0.02, count: 1 },
  ],
  zuma_statue: [
    { type: 'gold', chance: 1.0, min: 150, max: 350 },
    { type: 'item', itemId: 'hp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'mp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'steel_sword', chance: 0.05, count: 1 },
    { type: 'item', itemId: 'dragon_necklace', chance: 0.008, count: 1 },
    { type: 'item', itemId: 'prairie_dress', chance: 0.005, count: 1 },
    { type: 'item', itemId: 'bone_wand', chance: 0.006, count: 1 },
  ],
  moon_spider: [
    { type: 'gold', chance: 1.0, min: 120, max: 300 },
    { type: 'item', itemId: 'hp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'mp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'steel_sword', chance: 0.05, count: 1 },
    { type: 'item', itemId: 'cure_potion', chance: 0.01, count: 1 },
    { type: 'item', itemId: 'dragon_ring', chance: 0.006, count: 1 },
  ],
  blood_giant: [
    { type: 'gold', chance: 1.0, min: 200, max: 500 },
    { type: 'item', itemId: 'hp_potion_large', chance: 0.55, count: 1 },
    { type: 'item', itemId: 'mp_potion_large', chance: 0.5, count: 1 },
    { type: 'item', itemId: 'steel_armor', chance: 0.05, count: 1 },
    { type: 'item', itemId: 'dragon_helmet', chance: 0.008, count: 1 },
    { type: 'item', itemId: 'prairie_fire', chance: 0.005, count: 1 },
    { type: 'item', itemId: 'dragon_sword', chance: 0.004, count: 1 },
  ],

  // ==================== BOSS ====================
  // 沃玛教主：必掉金币 1000-3000，必掉 1-3 件中阶装备
  woma_boss: [
    { type: 'gold', chance: 1.0, min: 1000, max: 3000 },
    { type: 'item_group', chance: 1.0, items: ['bone_wand', 'dragon_sword', 'prairie_fire', 'prairie_dress'], countRange: [1, 3] },
    { type: 'item', itemId: 'hp_potion_large', chance: 0.8, count: 3 },
    { type: 'item', itemId: 'mp_potion_large', chance: 0.8, count: 3 },
    { type: 'item', itemId: 'home_scroll', chance: 0.5, count: 2 },
    { type: 'item', itemId: 'warrior_necklace', chance: 0.1, count: 1 },
  ],
  // 祖玛教主：必掉金币 3000-8000，必掉 2-4 件高阶装备（含圣战套件之一）
  // 圣战套件之一必掉（chance=1.0，count=1），另从高阶池随机 1-3 件，合计 2-4 件
  zuma_boss: [
    { type: 'gold', chance: 1.0, min: 3000, max: 8000 },
    { type: 'item_group', chance: 1.0, items: ['dragon_helmet', 'dragon_necklace', 'dragon_ring', 'dragon_bracelet', 'dragon_belt', 'dragon_boots', 'dragon_robe'], count: 1 },
    { type: 'item_group', chance: 1.0, items: ['prairie_fire', 'dragon_sword', 'bone_wand', 'dragon_helmet', 'dragon_necklace', 'dragon_ring', 'dragon_bracelet', 'dragon_belt', 'dragon_boots', 'dragon_robe'], countRange: [1, 3] },
    { type: 'item', itemId: 'hp_potion_large', chance: 0.9, count: 5 },
    { type: 'item', itemId: 'mp_potion_large', chance: 0.9, count: 5 },
    { type: 'item', itemId: 'cure_potion', chance: 0.3, count: 1 },
    { type: 'item', itemId: 'home_scroll', chance: 0.5, count: 3 },
  ],
  // 赤月恶魔：必掉金币 10000-30000，必掉 3-5 件顶级装备
  chiyue_boss: [
    { type: 'gold', chance: 1.0, min: 10000, max: 30000 },
    { type: 'item_group', chance: 1.0, items: ['dragon_slayer', 'dragon_robe', 'paralyze_ring', 'dragon_helmet', 'dragon_necklace', 'dragon_ring', 'dragon_bracelet', 'dragon_belt', 'dragon_boots', 'prairie_fire', 'dragon_sword', 'bone_wand'], countRange: [3, 5] },
    { type: 'item', itemId: 'hp_potion_large', chance: 1.0, count: 10 },
    { type: 'item', itemId: 'mp_potion_large', chance: 1.0, count: 10 },
    { type: 'item', itemId: 'cure_potion', chance: 0.5, count: 2 },
    { type: 'item', itemId: 'home_scroll', chance: 0.8, count: 5 },
  ],
};

/**
 * 取怪物的掉落表
 * @param {string} monsterId 怪物 ID
 * @returns {Array<object>} 掉落条目数组（无定义返回空数组）
 */
export function getDrops(monsterId) {
  return DROPS[monsterId] || [];
}

/**
 * 在 [min, max] 闭区间内取一个整数（rng 可注入便于测试）
 * @param {number} min
 * @param {number} max
 * @param {() => number} rng
 * @returns {number}
 */
function randInt(min, max, rng) {
  if (max < min) { const t = min; min = max; max = t; }
  return Math.floor(rng() * (max - min + 1)) + min;
}

/**
 * 解析掉落数量：countRange 优先，其次 count，默认 1
 * @param {object} entry 掉落条目
 * @param {() => number} rng
 * @returns {number}
 */
function rollCount(entry, rng) {
  if (Array.isArray(entry.countRange)) {
    return randInt(entry.countRange[0], entry.countRange[1], rng);
  }
  return entry.count || 1;
}

/**
 * 从物品池中抽取 count 个（默认不重复；池子用尽后允许重复）
 * @param {string[]} items 物品池
 * @param {number} count 抽取数量
 * @param {() => number} rng
 * @returns {string[]} 抽中的物品 ID 列表
 */
function pickDistinct(items, count, rng) {
  const pool = items.slice();
  const picks = [];
  for (let i = 0; i < count; i++) {
    if (pool.length > 0) {
      const idx = Math.floor(rng() * pool.length);
      picks.push(pool.splice(idx, 1)[0]);
    } else if (items.length > 0) {
      // 池子用尽，从原列表允许重复抽取
      picks.push(items[Math.floor(rng() * items.length)]);
    }
  }
  return picks;
}

/**
 * 对怪物掉落表进行摇奖，返回实际掉落数组
 *
 * 返回条目格式：
 *   { type: 'gold', count: 1, gold: amount }     // 金币（count 为堆数，gold 为数额）
 *   { type: 'item', itemId: '...', count: n }    // 物品（count 为件数）
 *
 * @param {string} monsterId 怪物 ID
 * @param {() => number} [rng=Math.random] 随机数生成器，可注入便于测试
 * @returns {Array<{type: string, itemId?: string, count: number, gold?: number}>} 实际掉落数组
 */
export function rollDrops(monsterId, rng = Math.random) {
  const table = DROPS[monsterId] || [];
  const results = [];
  for (const entry of table) {
    // 命中判定
    if (rng() > entry.chance) continue;

    if (entry.type === 'gold') {
      const gold = randInt(entry.min, entry.max, rng);
      results.push({ type: 'gold', count: 1, gold });
    } else if (entry.type === 'item') {
      const count = rollCount(entry, rng);
      results.push({ type: 'item', itemId: entry.itemId, count });
    } else if (entry.type === 'item_group') {
      const count = rollCount(entry, rng);
      const picks = pickDistinct(entry.items || [], count, rng);
      for (const itemId of picks) {
        results.push({ type: 'item', itemId, count: 1 });
      }
    }
  }
  return results;
}

export default DROPS;
