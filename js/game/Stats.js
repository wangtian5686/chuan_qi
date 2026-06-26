/**
 * Stats.js — 角色属性集合
 *
 * 职责：
 * - 维护角色的全部战斗属性（生命/魔法上限与当前值、攻防、命中闪避、幸运诅咒、移速/攻击范围/攻速）
 * - 由职业与等级生成基础属性（fromClassLevel）
 * - 支持装备 / buff / 套装加成的叠加与撤减（add / subtract / applyBuff / removeBuff）
 * - 深拷贝与序列化
 *
 * 约定：
 * - hp / mp 为"当前值"，maxHp / maxMp 为"上限"
 * - add / subtract 只对本对象已存在字段累加（"仅对存在的字段累加"）
 * - 装备的 +hp / +mp 加成在 recalculateStats 中体现为 maxHp / maxMp 的提升：
 *   fromClassLevel 令 hp = maxHp，叠加 +hp 后 hp 自然等于"新上限"，再由
 *   Player.recalculateStats 把 hp 重置为保留比例后的当前值。
 */

import { getStatAtLevel } from '../data/classes.js';

/** Stats 包含的全部字段（顺序固定，便于遍历 / 序列化） */
const STATS_FIELDS = [
  'maxHp', 'maxMp', 'hp', 'mp',
  'minAtk', 'maxAtk', 'minMatk', 'maxMatk',
  'def', 'mdef', 'hit', 'dodge',
  'lucky', 'curse',
  'moveSpeed', 'attackRange', 'attackSpeed',
];

export class Stats {
  constructor() {
    // 全部字段初始化为 0，保证 hasOwnProperty 为真，便于 add/subtract 累加
    for (const k of STATS_FIELDS) this[k] = 0;
  }

  /**
   * 由职业与等级生成基础属性
   * - getStatAtLevel 返回的 hp / mp 即为该等级的 maxHp / maxMp
   * - 初始当前 hp / mp 等于上限（满血满蓝）
   * @param {string} classId 职业 ID
   * @param {number} level 等级
   * @returns {Stats}
   */
  static fromClassLevel(classId, level) {
    const s = new Stats();
    const base = getStatAtLevel(classId, level);
    if (!base) return s;
    s.maxHp = base.hp;
    s.maxMp = base.mp;
    s.hp = s.maxHp;
    s.mp = s.maxMp;
    s.minAtk = base.minAtk;
    s.maxAtk = base.maxAtk;
    s.minMatk = base.minMatk;
    s.maxMatk = base.maxMatk;
    s.def = base.def;
    s.mdef = base.mdef;
    s.hit = base.hit;
    s.dodge = base.dodge;
    s.lucky = base.lucky;
    s.curse = base.curse;
    s.moveSpeed = base.moveSpeed;
    s.attackRange = base.attackRange;
    s.attackSpeed = base.attackSpeed;
    return s;
  }

  /**
   * 把一个属性对象（item.stats / buff.stats / 套装 bonus）的字段加到本对象
   * - 仅对本对象已存在的字段累加，避免引入未知字段
   * @param {object} itemStats 属性增量对象
   * @returns {Stats} this
   */
  add(itemStats) {
    if (!itemStats) return this;
    for (const key of Object.keys(itemStats)) {
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        this[key] += itemStats[key];
      }
    }
    return this;
  }

  /**
   * 减去一个属性对象的字段（add 的逆操作）
   * @param {object} itemStats 属性增量对象
   * @returns {Stats} this
   */
  subtract(itemStats) {
    if (!itemStats) return this;
    for (const key of Object.keys(itemStats)) {
      if (Object.prototype.hasOwnProperty.call(this, key)) {
        this[key] -= itemStats[key];
      }
    }
    return this;
  }

  /**
   * 应用 buff：若 buff.stats 存在则 add
   * @param {object} buff buff 对象
   * @returns {Stats} this
   */
  applyBuff(buff) {
    if (buff && buff.stats) this.add(buff.stats);
    return this;
  }

  /**
   * 移除 buff：若 buff.stats 存在则 subtract
   * @param {object} buff buff 对象
   * @returns {Stats} this
   */
  removeBuff(buff) {
    if (buff && buff.stats) this.subtract(buff.stats);
    return this;
  }

  /** 深拷贝 */
  clone() {
    const s = new Stats();
    for (const k of STATS_FIELDS) s[k] = this[k];
    return s;
  }

  /** 序列化为纯数据 */
  serialize() {
    const data = {};
    for (const k of STATS_FIELDS) data[k] = this[k];
    return data;
  }

  /**
   * 反序列化
   * @param {object} data
   * @returns {Stats}
   */
  static deserialize(data) {
    const s = new Stats();
    if (!data) return s;
    for (const k of STATS_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(data, k)) s[k] = data[k];
    }
    return s;
  }
}

export default Stats;
