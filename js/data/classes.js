/**
 * classes.js — 职业配置表
 *
 * 三大职业：战士(warrior) / 法师(mage) / 道士(taoist)
 * 每个职业定义：
 * - base：1 级基础属性（hp/mp 为 1 级上限值）
 * - growth：每级成长增量（仅列出有成长的属性）
 * - startItems：起始物品（按 ID 引用 items.js，由 getStartItems 解析为完整物品）
 * - startSkills：起始已学技能 ID
 * - learnableSkills：可学习技能列表（含学习等级与金币花费）
 *
 * 升级公式（见 getStatAtLevel）：
 *   stat(level) = base.stat + growth.stat * (level - 1)
 *   maxHp(level) = base.hp + base.maxHpPerLevel * (level - 1)
 *   maxMp(level) = base.mp + base.maxMpPerLevel * (level - 1)
 */

import { getItem } from './items.js';

/**
 * 职业定义对象，键为职业 ID
 * @type {Record<string, object>}
 */
export const CLASSES = {
  // ==================== 战士 ====================
  warrior: {
    id: 'warrior',
    name: '战士',
    description: '近战物理职业，高血量低魔法',
    base: {
      hp: 28, mp: 10,
      maxHpPerLevel: 8, maxMpPerLevel: 2,
      minAtk: 4, maxAtk: 6,
      minMatk: 1, maxMatk: 2,
      def: 0, mdef: 0,
      hit: 12, dodge: 6,
      lucky: 0, curse: 0,
      moveSpeed: 4, // 瓦片/秒
      attackRange: 1, // 瓦片
      attackSpeed: 1.2, // 每秒攻击次数
    },
    growth: {
      // 每级增量（偏向物理攻击与物理防御）
      minAtk: 2, maxAtk: 3,
      def: 1, hit: 1, dodge: 0.5,
    },
    startItems: [
      { itemId: 'wooden_sword', count: 1, equipped: true },
      { itemId: 'cloth_armor', count: 1, equipped: true },
      { itemId: 'hp_potion_small', count: 5 },
    ],
    startSkills: ['basic_swordmanship'],
    learnableSkills: [
      { skillId: 'basic_swordmanship', level: 1, cost: 0 },
      { skillId: 'attack_slash', level: 7, cost: 500 },
      { skillId: 'thrust_slash', level: 15, cost: 2000 },
      { skillId: 'half_moon', level: 19, cost: 5000 },
      { skillId: 'fire_blade', level: 24, cost: 12000 },
      { skillId: 'savage_charge', level: 27, cost: 25000 },
    ],
  },

  // ==================== 法师 ====================
  mage: {
    id: 'mage',
    name: '法师',
    description: '远程魔法职业，低血量高魔法',
    base: {
      hp: 16, mp: 30,
      maxHpPerLevel: 3, maxMpPerLevel: 8,
      minAtk: 1, maxAtk: 2,
      minMatk: 4, maxMatk: 6,
      def: 0, mdef: 2,
      hit: 12, dodge: 8,
      lucky: 0, curse: 0,
      moveSpeed: 4, // 瓦片/秒
      attackRange: 5, // 瓦片
      attackSpeed: 1.0, // 每秒攻击次数
    },
    growth: {
      // 每级增量（偏向魔法攻击与魔法防御）
      minMatk: 2, maxMatk: 3,
      mdef: 1, hit: 1, dodge: 0.5,
    },
    startItems: [
      { itemId: 'wooden_staff', count: 1, equipped: true },
      { itemId: 'cloth_armor', count: 1, equipped: true },
      { itemId: 'mp_potion_small', count: 5 },
    ],
    startSkills: ['fireball'],
    learnableSkills: [
      { skillId: 'fireball', level: 1, cost: 0 },
      { skillId: 'repel_fire', level: 12, cost: 2000 },
      { skillId: 'lure_light', level: 13, cost: 2500 },
      { skillId: 'hell_thunder', level: 17, cost: 5000 },
      { skillId: 'teleport', level: 19, cost: 8000 },
      { skillId: 'fire_wall', level: 24, cost: 12000 },
      { skillId: 'magic_shield', level: 22, cost: 10000 },
      { skillId: 'blizzard', level: 30, cost: 30000 },
    ],
  },

  // ==================== 道士 ====================
  taoist: {
    id: 'taoist',
    name: '道士',
    description: '辅助召唤职业，血魔均衡',
    base: {
      hp: 22, mp: 18,
      maxHpPerLevel: 5, maxMpPerLevel: 5,
      minAtk: 3, maxAtk: 4,
      minMatk: 2, maxMatk: 3,
      def: 1, mdef: 1,
      hit: 11, dodge: 7,
      lucky: 1, curse: 0,
      moveSpeed: 4, // 瓦片/秒
      attackRange: 2, // 瓦片
      attackSpeed: 1.1, // 每秒攻击次数
    },
    growth: {
      // 每级增量（攻防均衡）
      minAtk: 1, maxAtk: 2,
      minMatk: 1, maxMatk: 2,
      def: 1, mdef: 0.5, hit: 1, dodge: 0.5,
    },
    startItems: [
      { itemId: 'wooden_sword', count: 1, equipped: true },
      { itemId: 'cloth_armor', count: 1, equipped: true },
      { itemId: 'hp_potion_small', count: 5 },
      { itemId: 'mp_potion_small', count: 5 },
    ],
    startSkills: ['heal'],
    learnableSkills: [
      { skillId: 'heal', level: 1, cost: 0 },
      { skillId: 'spirit_force', level: 7, cost: 500 },
      { skillId: 'poison', level: 13, cost: 2500 },
      { skillId: 'soul_fire', level: 14, cost: 3000 },
      { skillId: 'summon_skeleton', level: 19, cost: 8000 },
      { skillId: 'hide', level: 20, cost: 10000 },
      { skillId: 'magic_shield', level: 22, cost: 10000 },
      { skillId: 'summon_beast', level: 35, cost: 50000 },
    ],
  },
};

/**
 * 按 ID 取职业定义
 * @param {string} id 职业 ID（'warrior'/'mage'/'taoist'）
 * @returns {object|undefined} 职业定义（不存在则 undefined）
 */
export function getClass(id) {
  return CLASSES[id];
}

/**
 * 计算指定职业在指定等级下的完整属性
 *
 * 计算规则：
 * - maxHp = base.hp + base.maxHpPerLevel * (level - 1)
 * - maxMp = base.mp + base.maxMpPerLevel * (level - 1)
 * - 其余属性 = base.attr + growth.attr * (level - 1)（growth 未列出的属性保持基础值）
 * - moveSpeed / attackRange / attackSpeed / lucky / curse 不随等级成长
 *
 * @param {string} classId 职业 ID
 * @param {number} level 等级（>=1）
 * @returns {object|null} 该等级下的属性对象；职业不存在返回 null
 */
export function getStatAtLevel(classId, level) {
  const cls = CLASSES[classId];
  if (!cls) return null;

  const lvl = Math.max(1, level | 0);
  const k = lvl - 1; // 成长系数
  const base = cls.base;
  const growth = cls.growth || {};

  // 以基础属性为底，叠加成长
  const stats = {
    hp: base.hp + base.maxHpPerLevel * k, // maxHp
    mp: base.mp + base.maxMpPerLevel * k, // maxMp
    maxHpPerLevel: base.maxHpPerLevel,
    maxMpPerLevel: base.maxMpPerLevel,
    minAtk: base.minAtk + (growth.minAtk || 0) * k,
    maxAtk: base.maxAtk + (growth.maxAtk || 0) * k,
    minMatk: base.minMatk + (growth.minMatk || 0) * k,
    maxMatk: base.maxMatk + (growth.maxMatk || 0) * k,
    def: base.def + (growth.def || 0) * k,
    mdef: base.mdef + (growth.mdef || 0) * k,
    hit: base.hit + (growth.hit || 0) * k,
    dodge: base.dodge + (growth.dodge || 0) * k,
    lucky: base.lucky,
    curse: base.curse,
    moveSpeed: base.moveSpeed,
    attackRange: base.attackRange,
    attackSpeed: base.attackSpeed,
  };

  return stats;
}

/**
 * 解析职业起始物品为完整物品定义列表
 * - 引用 items.js 的 getItem，把 startItems 中的 itemId 解析为物品对象
 * - 保留 count / equipped 等装配信息
 * - 物品 ID 无效时跳过该条目（防御性处理）
 * @param {string} classId 职业 ID
 * @returns {Array<{item: object, count: number, equipped: boolean}>} 起始物品列表
 */
export function getStartItems(classId) {
  const cls = CLASSES[classId];
  if (!cls || !cls.startItems) return [];
  const result = [];
  for (const entry of cls.startItems) {
    const item = getItem(entry.itemId);
    if (!item) continue; // 物品 ID 无效，跳过
    result.push({
      item,
      count: entry.count || 1,
      equipped: !!entry.equipped,
    });
  }
  return result;
}

export default CLASSES;
