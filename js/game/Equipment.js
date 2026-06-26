/**
 * Equipment.js — 10 槽装备管理
 *
 * 装备槽位：
 *   weapon / armor / helmet / necklace /
 *   ringLeft / ringRight /
 *   braceletLeft / braceletRight /
 *   belt / boots
 *
 * 职责：
 * - 维护 10 个装备槽，每槽为 null 或 { itemId, durability }
 * - 穿戴 / 卸下装备，返回被替换的旧装备
 * - 遍历已穿戴装备，供属性聚合与套装加成计算
 * - 序列化 / 反序列化
 *
 * 注意：
 * - 本类只管理槽位数据，不校验职业 / 等级限制（由 ItemOps.canEquip 负责）
 * - 戒指 / 手镯的左右槽选择逻辑由 ItemOps.equipItem 决定
 *   本类的 equip 直接按传入的 slot 穿戴并返回旧装备
 */

/** 装备槽名列表（顺序固定，便于 UI 与序列化） */
export const EQUIP_SLOTS = [
  'weapon',
  'armor',
  'helmet',
  'necklace',
  'ringLeft',
  'ringRight',
  'braceletLeft',
  'braceletRight',
  'belt',
  'boots',
];

/**
 * 物品定义中 slot 字段到装备槽名的映射
 * - 戒指 / 手镯对应两个槽，按数组顺序优先选择
 */
export const SLOT_TO_EQUIP = {
  weapon: ['weapon'],
  armor: ['armor'],
  helmet: ['helmet'],
  necklace: ['necklace'],
  ring: ['ringLeft', 'ringRight'],
  bracelet: ['braceletLeft', 'braceletRight'],
  belt: ['belt'],
  boots: ['boots'],
};

export class Equipment {
  constructor() {
    /** @type {Record<string,{itemId:string,durability:number}|null>} */
    this.slots = {};
    for (const name of EQUIP_SLOTS) this.slots[name] = null;
    /** 已变更标记，供属性重算 / UI 感知 */
    this.dirty = true;
  }

  /**
   * 穿戴装备到指定槽
   * @param {string} slot 装备槽名（见 EQUIP_SLOTS）
   * @param {string} itemId 物品 ID
   * @param {number} durability 当前耐久
   * @returns {{itemId:string,durability:number}|null} 被替换的旧装备（无则 null）
   */
  equip(slot, itemId, durability) {
    if (!this.slots.hasOwnProperty(slot)) return null;
    const replaced = this.slots[slot];
    this.slots[slot] = { itemId, durability: durability ?? 0 };
    this.dirty = true;
    return replaced;
  }

  /**
   * 卸下指定槽的装备
   * @param {string} slot 装备槽名
   * @returns {{itemId:string,durability:number}|null} 卸下的装备（空槽返回 null）
   */
  unequip(slot) {
    if (!this.slots.hasOwnProperty(slot)) return null;
    const removed = this.slots[slot];
    this.slots[slot] = null;
    this.dirty = true;
    return removed;
  }

  /** 获取某槽装备（只读引用） */
  getSlot(slot) {
    return this.slots[slot] || null;
  }

  /**
   * 返回所有已穿戴装备的物品 ID 列表（用于套装加成检测）
   * @returns {string[]}
   */
  getEquippedItemIds() {
    const ids = [];
    for (const name of EQUIP_SLOTS) {
      const s = this.slots[name];
      if (s) ids.push(s.itemId);
    }
    return ids;
  }

  /**
   * 遍历所有已穿戴装备
   * @param {(slot:string, item:{itemId:string,durability:number})=>void} cb 回调
   */
  forEachEquipped(cb) {
    for (const name of EQUIP_SLOTS) {
      const s = this.slots[name];
      if (s) cb(name, s);
    }
  }

  /** 清空所有装备槽 */
  clear() {
    for (const name of EQUIP_SLOTS) this.slots[name] = null;
    this.dirty = true;
  }

  /** 序列化 */
  serialize() {
    const data = {};
    for (const name of EQUIP_SLOTS) {
      const s = this.slots[name];
      data[name] = s ? { ...s } : null;
    }
    return data;
  }

  /**
   * 反序列化
   * @param {object} data
   * @returns {Equipment}
   */
  static deserialize(data) {
    const eq = new Equipment();
    if (!data) return eq;
    for (const name of EQUIP_SLOTS) {
      const s = data[name];
      eq.slots[name] = s ? { ...s } : null;
    }
    eq.dirty = true;
    return eq;
  }
}

export default Equipment;
