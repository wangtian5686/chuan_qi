/**
 * Inventory.js — 24 格背包
 *
 * 职责：
 * - 维护 24 个格子（slots），每格为 null 或一个堆叠对象
 * - 支持加入 / 移除 / 计数 / 查找 / 移动 / 交换 / 合并堆叠
 * - 提供序列化与反序列化，供存档系统使用
 *
 * 约定：
 * - 堆叠对象结构：{ itemId:string, count:number, durability:number|null }
 *   - 装备类（非堆叠）：count 恒为 1，durability 为当前耐久
 *   - 消耗品类（可堆叠）：count 为数量，durability 为 null
 * - 物品定义（耐久上限、是否可堆叠、最大堆叠数）从 items.js 的 ITEMS 取
 * - 加入物品时优先堆叠到已有的同物品格，再放空格
 */

import { getItem } from '../data/items.js';

/** 背包格子总数 */
export const INVENTORY_SIZE = 24;

export class Inventory {
  constructor() {
    /** @type {Array<{itemId:string,count:number,durability:number|null}|null>} */
    this.slots = new Array(INVENTORY_SIZE).fill(null);
    /** 已变更标记，供 UI / 存档感知（外部可读写） */
    this.dirty = true;
  }

  /**
   * 加入物品
   * - 可堆叠物品优先合并到已有同 id 格，超出部分放空格
   * - 不可堆叠物品（装备）每格放 1 件
   * @param {string} itemId 物品 ID
   * @param {number} [count=1] 数量
   * @param {number|null} [durability=null] 装备耐久（消耗品传 null）
   * @returns {number} 实际加入的数量（背包满则可能小于请求量）
   */
  addItem(itemId, count = 1, durability = null) {
    const def = getItem(itemId);
    if (!def || count <= 0) return 0;

    let remaining = count;
    const stackable = !!def.stackable;
    const maxStack = def.maxStack || 1;

    // 1) 优先合并到已有同物品格（仅可堆叠物品）
    if (stackable) {
      for (let i = 0; i < INVENTORY_SIZE && remaining > 0; i++) {
        const s = this.slots[i];
        if (!s || s.itemId !== itemId) continue;
        if (s.count >= maxStack) continue;
        const canAdd = maxStack - s.count;
        const add = Math.min(canAdd, remaining);
        s.count += add;
        remaining -= add;
      }
    }

    // 2) 剩余部分放空格
    while (remaining > 0) {
      const idx = this.getFirstEmptySlot();
      if (idx < 0) break;
      if (stackable) {
        const add = Math.min(maxStack, remaining);
        this.slots[idx] = { itemId, count: add, durability: null };
        remaining -= add;
      } else {
        // 装备：一格一件
        this.slots[idx] = { itemId, count: 1, durability: durability ?? def.maxDurability ?? null };
        remaining -= 1;
      }
    }

    const added = count - remaining;
    if (added > 0) this.dirty = true;
    return added;
  }

  /**
   * 从指定格移除物品
   * @param {number} slot 槽索引
   * @param {number} [count=1] 移除数量
   * @returns {number} 实际移除数量（不足或空槽返回 0）
   */
  removeItem(slot, count = 1) {
    if (slot < 0 || slot >= INVENTORY_SIZE) return 0;
    const s = this.slots[slot];
    if (!s || count <= 0) return 0;
    const removed = Math.min(s.count, count);
    s.count -= removed;
    if (s.count <= 0) this.slots[slot] = null;
    this.dirty = true;
    return removed;
  }

  /**
   * 统计背包中某物品的总数量
   * @param {string} itemId 物品 ID
   * @returns {number}
   */
  countItem(itemId) {
    let total = 0;
    for (const s of this.slots) {
      if (s && s.itemId === itemId) total += s.count;
    }
    return total;
  }

  /**
   * 查找第一个包含该物品的槽索引
   * @param {string} itemId 物品 ID
   * @returns {number} 槽索引，未找到返回 -1
   */
  findItem(itemId) {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const s = this.slots[i];
      if (s && s.itemId === itemId) return i;
    }
    return -1;
  }

  /**
   * 查找所有包含该物品的槽索引
   * @param {string} itemId 物品 ID
   * @returns {number[]}
   */
  findItems(itemId) {
    const result = [];
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const s = this.slots[i];
      if (s && s.itemId === itemId) result.push(i);
    }
    return result;
  }

  /**
   * 移动一格内容到另一格
   * - 目标空：直接移动
   * - 目标非空：按规则合并 / 交换
   * @param {number} fromSlot 源槽
   * @param {number} toSlot 目标槽
   * @returns {boolean} 是否执行了操作
   */
  moveItem(fromSlot, toSlot) {
    if (fromSlot === toSlot) return false;
    if (fromSlot < 0 || fromSlot >= INVENTORY_SIZE) return false;
    if (toSlot < 0 || toSlot >= INVENTORY_SIZE) return false;

    const from = this.slots[fromSlot];
    const to = this.slots[toSlot];
    if (!from) return false;

    if (!to) {
      // 目标空：直接移动
      this.slots[toSlot] = from;
      this.slots[fromSlot] = null;
      this.dirty = true;
      return true;
    }

    // 目标非空：同物品且可堆叠则合并，否则交换
    if (to.itemId === from.itemId) {
      const def = getItem(to.itemId);
      const stackable = !!def && !!def.stackable;
      if (stackable) {
        const maxStack = def.maxStack || 1;
        const canAdd = maxStack - to.count;
        if (canAdd > 0) {
          const move = Math.min(canAdd, from.count);
          to.count += move;
          from.count -= move;
          if (from.count <= 0) this.slots[fromSlot] = null;
          this.dirty = true;
          return true;
        }
      }
    }
    // 交换
    this.slots[toSlot] = from;
    this.slots[fromSlot] = to;
    this.dirty = true;
    return true;
  }

  /**
   * 交换两格内容
   * @param {number} slotA
   * @param {number} slotB
   */
  swap(slotA, slotB) {
    if (slotA === slotB) return;
    if (slotA < 0 || slotA >= INVENTORY_SIZE) return;
    if (slotB < 0 || slotB >= INVENTORY_SIZE) return;
    const tmp = this.slots[slotA];
    this.slots[slotA] = this.slots[slotB];
    this.slots[slotB] = tmp;
    this.dirty = true;
  }

  /** 第一个空槽索引，满返回 -1 */
  getFirstEmptySlot() {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      if (this.slots[i] === null) return i;
    }
    return -1;
  }

  /** 背包是否已满 */
  isFull() {
    return this.getFirstEmptySlot() < 0;
  }

  /** 获取某格内容（只读引用，不应被外部修改） */
  getSlot(slot) {
    return this.slots[slot] || null;
  }

  /** 清空背包 */
  clear() {
    this.slots = new Array(INVENTORY_SIZE).fill(null);
    this.dirty = true;
  }

  /** 序列化为可存档的纯数据 */
  serialize() {
    return {
      size: INVENTORY_SIZE,
      slots: this.slots.map((s) => (s ? { ...s } : null)),
    };
  }

  /**
   * 从序列化数据恢复
   * @param {object} data
   * @returns {Inventory}
   */
  static deserialize(data) {
    const inv = new Inventory();
    if (!data || !Array.isArray(data.slots)) return inv;
    for (let i = 0; i < INVENTORY_SIZE && i < data.slots.length; i++) {
      const s = data.slots[i];
      inv.slots[i] = s ? { ...s } : null;
    }
    inv.dirty = true;
    return inv;
  }
}

export default Inventory;
