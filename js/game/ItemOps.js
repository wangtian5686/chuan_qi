/**
 * ItemOps.js — 物品操作工具函数
 *
 * 提供穿戴 / 卸下 / 使用 / 丢弃 / 合并 / 修理 / 买卖 等纯函数，
 * 通过 player 参数与 Player 实体交互。
 *
 * Player 接口约定（由 Player.js 实现，本模块只读不写其内部状态）：
 *   - player.inventory : Inventory     背包实例
 *   - player.equipment : Equipment     装备实例
 *   - player.classId : string          职业 id（'warrior'/'mage'/'taoist'）
 *   - player.level : number            等级
 *   - player.gold : number             金币（可读写）
 *   - player.pkValue : number          PK 值（可读写）
 *   - player.tx / player.ty : number   瓦片坐标（丢弃时生成地面掉落物用）
 *   - player.mapId : string            当前地图 id
 *   - player.heal(amount)              治疗 HP
 *   - player.healMp(amount)            恢复 MP
 *   - player.recalculateStats()        属性重算（穿戴/卸下后调用）
 *
 * 返回值统一为 { ok:boolean, reason?:string, ...其他字段 }。
 */

import { getItem } from '../data/items.js';
import { SLOT_TO_EQUIP } from './Equipment.js';
import { DropItem } from './DropItem.js';

/** 修理费系数：按 (耐久损失比例 × 物品售价 × 系数) 计算 */
const REPAIR_PRICE_FACTOR = 0.25;

/**
 * 取玩家职业 id（兼容 player.classId / player.class 两种命名）
 * @param {object} player
 * @returns {string}
 */
function _getClassId(player) {
  return player.classId || player.class || '';
}

/**
 * 触发玩家属性重算（兼容多种方法名；Player 任务未实现时安全跳过）
 * @param {object} player
 */
function _recalc(player) {
  if (!player) return;
  if (typeof player.recalculateStats === 'function') player.recalculateStats();
  else if (typeof player.applyEquipmentStats === 'function') player.applyEquipmentStats();
  else if (typeof player.updateStats === 'function') player.updateStats();
  else if (typeof player.recalcStats === 'function') player.recalcStats();
}

/**
 * 把传入的 item 规范化为 { def, durability }
 * - 接受背包/装备格对象 { itemId, durability }
 * - 也接受物品定义对象（含 id / durability / maxDurability）
 * @param {object} item
 * @returns {{def:object, durability:number|null}|null}
 */
function _normalizeItem(item) {
  if (!item) return null;
  let def, durability;
  if (item.itemId) {
    def = getItem(item.itemId);
    durability = item.durability;
  } else if (item.id) {
    def = item;
    durability = item.durability;
  } else {
    return null;
  }
  if (!def) return null;
  return { def, durability };
}

/**
 * 检查物品是否可被玩家穿戴
 * - 类型必须是装备（有 slot 字段）
 * - 职业限制满足（classRestriction 为 null 表示三职业通用）
 * - 等级限制满足（levelRestriction 缺省视为 0）
 * - 当前耐久 > 0（损坏装备不可穿戴）
 * @param {object} item 物品（格对象或定义）
 * @param {object} player
 * @returns {{ok:boolean, reason?:string}}
 */
export function canEquip(item, player) {
  const norm = _normalizeItem(item);
  if (!norm) return { ok: false, reason: 'invalid_item' };
  const { def, durability } = norm;

  // 类型是装备
  if (!def.slot) return { ok: false, reason: 'not_equipment' };

  // 职业限制
  if (def.classRestriction && Array.isArray(def.classRestriction) && def.classRestriction.length > 0) {
    const cls = _getClassId(player);
    if (!def.classRestriction.includes(cls)) {
      return { ok: false, reason: 'class_restricted' };
    }
  }

  // 等级限制
  if (def.levelRestriction && player.level < def.levelRestriction) {
    return { ok: false, reason: 'level_restricted' };
  }

  // 耐久 > 0（损坏装备不可穿戴）
  if (durability != null && durability <= 0) {
    return { ok: false, reason: 'broken' };
  }

  return { ok: true };
}

/**
 * 从背包某格穿戴到对应装备槽
 * - 戒指 / 手镯有两个槽，自动找空槽；都满则替换 left
 * - 若目标槽已有装备，旧装备放回背包（优先放入刚腾出的格子）
 * @param {object} player
 * @param {number} invSlot 背包格索引
 * @returns {{ok:boolean, reason?:string, replacedItem?:object|null}}
 */
export function equipItem(player, invSlot) {
  const inv = player.inventory;
  const eq = player.equipment;
  if (!inv || !eq) return { ok: false, reason: 'no_inventory' };

  const stack = inv.getSlot(invSlot);
  if (!stack) return { ok: false, reason: 'empty_slot' };

  const def = getItem(stack.itemId);
  if (!def) return { ok: false, reason: 'invalid_item' };

  // 可穿戴检查
  const check = canEquip(stack, player);
  if (!check.ok) return check;

  // 确定目标装备槽候选
  const candidates = SLOT_TO_EQUIP[def.slot];
  if (!candidates) return { ok: false, reason: 'not_equipment' };

  // 找空槽，都满则替换第一个（left）
  let targetSlot = candidates[0];
  for (const c of candidates) {
    if (!eq.getSlot(c)) {
      targetSlot = c;
      break;
    }
  }

  // 穿戴并取回被替换的旧装备
  const replaced = eq.equip(targetSlot, stack.itemId, stack.durability);

  // 从背包移除该装备（装备 count 恒为 1）
  inv.removeItem(invSlot, 1);

  // 旧装备放回背包
  if (replaced) {
    inv.addItem(replaced.itemId, 1, replaced.durability);
  }

  _recalc(player);
  return { ok: true, replacedItem: replaced || null };
}

/**
 * 卸下装备到背包
 * @param {object} player
 * @param {string} equipSlot 装备槽名（weapon / armor / ... / ringLeft 等）
 * @returns {{ok:boolean, reason?:string, item?:object|null}}
 */
export function unequipItem(player, equipSlot) {
  const inv = player.inventory;
  const eq = player.equipment;
  if (!inv || !eq) return { ok: false, reason: 'no_inventory' };

  const cur = eq.getSlot(equipSlot);
  if (!cur) return { ok: false, reason: 'empty_slot' };

  // 背包满则失败
  if (inv.isFull()) return { ok: false, reason: 'inventory_full' };

  eq.unequip(equipSlot);
  inv.addItem(cur.itemId, 1, cur.durability);

  _recalc(player);
  return { ok: true, item: cur };
}

/**
 * 使用消耗品（药水 / 卷轴）
 * - hp 药：player.heal(effectValue)
 * - mp 药：player.healMp(effectValue)
 * - 赎罪药水：player.pkValue = max(0, pkValue + effectValue)（effectValue 为负）
 * - 回城卷轴：返回 { effect:'teleport_home' }，由 game 处理实际传送
 * @param {object} player
 * @param {number} invSlot 背包格索引
 * @returns {{ok:boolean, reason?:string, effect?:string}}
 */
export function useItem(player, invSlot) {
  const inv = player.inventory;
  if (!inv) return { ok: false, reason: 'no_inventory' };

  const stack = inv.getSlot(invSlot);
  if (!stack) return { ok: false, reason: 'empty_slot' };

  const def = getItem(stack.itemId);
  if (!def) return { ok: false, reason: 'invalid_item' };

  // 仅消耗品可使用
  if (def.type !== 'potion' && def.type !== 'scroll') {
    return { ok: false, reason: 'not_consumable' };
  }

  const effect = def.effect;
  const value = def.effectValue;

  switch (effect) {
    case 'heal_hp':
      if (typeof player.heal === 'function') player.heal(value);
      break;
    case 'heal_mp':
      if (typeof player.healMp === 'function') player.healMp(value);
      break;
    case 'cure_pk':
      // effectValue 为负数（-100），相加即降低 PK 值，下限 0
      if (typeof player.pkValue === 'number') {
        player.pkValue = Math.max(0, player.pkValue + (value || 0));
      }
      break;
    case 'teleport_home':
      // 消耗卷轴，传送由 game 处理
      inv.removeItem(invSlot, 1);
      return { ok: true, effect: 'teleport_home' };
    default:
      return { ok: false, reason: 'unknown_effect' };
  }

  // 消耗一个
  inv.removeItem(invSlot, 1);
  return { ok: true, effect };
}

/**
 * 丢弃物品（从背包移除并生成地面掉落物，由 game 加入地图）
 * - 装备类保留耐久到 DropItem.durability
 * @param {object} player
 * @param {number} invSlot 背包格索引
 * @param {number} [count=1] 丢弃数量
 * @returns {{ok:boolean, reason?:string, drop?:DropItem|object}}
 */
export function dropItem(player, invSlot, count = 1) {
  const inv = player.inventory;
  if (!inv) return { ok: false, reason: 'no_inventory' };

  const stack = inv.getSlot(invSlot);
  if (!stack) return { ok: false, reason: 'empty_slot' };

  const def = getItem(stack.itemId);
  if (!def) return { ok: false, reason: 'invalid_item' };

  const dropCount = Math.min(count, stack.count);

  // 从背包移除
  inv.removeItem(invSlot, dropCount);

  // 生成地面掉落物（用玩家当前瓦片坐标与地图）
  const tx = player.tx != null ? player.tx : (player.x != null ? Math.floor(player.x) : 0);
  const ty = player.ty != null ? player.ty : (player.y != null ? Math.floor(player.y) : 0);
  const mapId = player.mapId != null ? player.mapId : null;
  // 装备才需要保留耐久
  const durability = def.slot ? stack.durability : null;

  let drop;
  if (mapId != null) {
    drop = new DropItem(stack.itemId, dropCount, tx, ty, mapId, null, durability);
  } else {
    // 缺少地图信息时返回原始数据，由 game 自行构造
    drop = { itemId: stack.itemId, count: dropCount, durability, tx, ty };
  }

  return { ok: true, drop };
}

/**
 * 合并堆叠：把 fromSlot 的物品合并到 toSlot
 * - 仅同物品且可堆叠时合并，受 maxStack 限制
 * - 不可合并时不做改动（调用方可改用 moveItem/swap）
 * @param {number} fromSlot 源槽
 * @param {number} toSlot 目标槽
 * @param {object} inventory Inventory 实例
 * @returns {number} 实际合并的数量（0 表示未合并）
 */
export function stackItem(fromSlot, toSlot, inventory) {
  if (fromSlot === toSlot) return 0;
  const from = inventory.getSlot(fromSlot);
  const to = inventory.getSlot(toSlot);
  if (!from || !to) return 0;
  if (from.itemId !== to.itemId) return 0;

  const def = getItem(from.itemId);
  if (!def || !def.stackable) return 0;

  const maxStack = def.maxStack || 1;
  const canAdd = maxStack - to.count;
  if (canAdd <= 0) return 0;

  const move = Math.min(canAdd, from.count);
  if (move <= 0) return 0;

  // to 是槽对象引用，直接累加；from 通过 removeItem 扣减（归零自动清空）
  to.count += move;
  inventory.removeItem(fromSlot, move);
  inventory.dirty = true;
  return move;
}

/**
 * 修理单件装备耐久回满
 * @param {object} item 装备格对象 { itemId, durability }
 * @returns {number} 修理费（0 表示无需修理或非装备）
 */
export function repairItem(item) {
  const norm = _normalizeItem(item);
  if (!norm) return 0;
  const { def, durability } = norm;
  if (!def || !def.maxDurability) return 0;

  const maxDur = def.maxDurability;
  const cur = durability != null ? durability : maxDur;
  if (cur >= maxDur) return 0;

  const loss = maxDur - cur;
  // 修理费 = 耐久损失比例 × 售价 × 系数
  const cost = Math.max(1, Math.floor(def.price * (loss / maxDur) * REPAIR_PRICE_FACTOR));

  // 回写耐久（修改传入的格对象）
  item.durability = maxDur;
  return cost;
}

/**
 * 修理身上所有装备，返回总修理费
 * - 金币不足时不修理，返回 { ok:false, reason:'gold_insufficient', cost }
 * - 金币足够则修理全部并扣除金币
 * @param {object} player
 * @returns {{ok:boolean, reason?:string, cost:number}}
 */
export function repairAll(player) {
  const eq = player.equipment;
  if (!eq) return { ok: false, reason: 'no_equipment', cost: 0 };

  // 先统计总修理费（不修改耐久）
  let totalCost = 0;
  const repairList = [];
  eq.forEachEquipped((slot, item) => {
    const def = getItem(item.itemId);
    if (!def || !def.maxDurability) return;
    const cur = item.durability != null ? item.durability : def.maxDurability;
    if (cur >= def.maxDurability) return;
    const loss = def.maxDurability - cur;
    const cost = Math.max(1, Math.floor(def.price * (loss / def.maxDurability) * REPAIR_PRICE_FACTOR));
    totalCost += cost;
    repairList.push({ slot, item });
  });

  if (totalCost <= 0) {
    return { ok: true, cost: 0 };
  }

  // 金币检查
  if (player.gold < totalCost) {
    return { ok: false, reason: 'gold_insufficient', cost: totalCost };
  }

  // 执行修理 + 扣费
  for (const { item } of repairList) {
    const def = getItem(item.itemId);
    item.durability = def.maxDurability;
  }
  player.gold -= totalCost;
  eq.dirty = true;
  _recalc(player);
  return { ok: true, cost: totalCost };
}

/**
 * 卖出物品给商店
 * - 玩家出售价 = floor(item.price / 2)
 * @param {object} player
 * @param {number} invSlot 背包格索引
 * @param {number} [count=1] 卖出数量
 * @returns {{ok:boolean, reason?:string, gold?:number}}
 */
export function sellItem(player, invSlot, count = 1) {
  const inv = player.inventory;
  if (!inv) return { ok: false, reason: 'no_inventory' };

  const stack = inv.getSlot(invSlot);
  if (!stack) return { ok: false, reason: 'empty_slot' };

  const def = getItem(stack.itemId);
  if (!def) return { ok: false, reason: 'invalid_item' };
  if (!def.price || def.price <= 0) return { ok: false, reason: 'not_sellable' };

  const sellCount = Math.min(count, stack.count);
  const unitPrice = Math.floor(def.price / 2);
  const gold = unitPrice * sellCount;

  inv.removeItem(invSlot, sellCount);
  player.gold = (player.gold || 0) + gold;

  return { ok: true, gold };
}

/**
 * 从商店购买物品
 * - 检查金币与背包空间
 * @param {object} player
 * @param {string} itemId 物品 ID
 * @param {number} [count=1] 购买数量
 * @returns {{ok:boolean, reason?:string}}
 */
export function buyItem(player, itemId, count = 1) {
  const inv = player.inventory;
  if (!inv) return { ok: false, reason: 'no_inventory' };

  const def = getItem(itemId);
  if (!def) return { ok: false, reason: 'invalid_item' };
  if (count <= 0) return { ok: false, reason: 'invalid_count' };

  const totalCost = def.price * count;
  if (player.gold < totalCost) return { ok: false, reason: 'gold_insufficient' };

  // 背包空间检查
  if (!_canHold(inv, itemId, count)) {
    return { ok: false, reason: 'inventory_full' };
  }

  // 扣费 + 入包
  player.gold -= totalCost;
  const added = inv.addItem(itemId, count, def.maxDurability ?? null);
  if (added < count) {
    // 容错：理论上 _canHold 已保证足够，这里回退多余金币
    const refund = (count - added) * def.price;
    player.gold += refund;
    return { ok: false, reason: 'inventory_full' };
  }

  return { ok: true };
}

/**
 * 估算背包能否再容纳指定数量的某物品
 * @param {object} inv Inventory
 * @param {string} itemId
 * @param {number} count
 * @returns {boolean}
 */
function _canHold(inv, itemId, count) {
  const def = getItem(itemId);
  if (!def) return false;

  if (def.stackable) {
    const maxStack = def.maxStack || 1;
    // 已有同物品格的剩余容量
    let capacity = 0;
    for (const s of inv.slots) {
      if (s && s.itemId === itemId) capacity += (maxStack - s.count);
    }
    // 加上空格容量
    for (const s of inv.slots) {
      if (s === null) capacity += maxStack;
    }
    return capacity >= count;
  } else {
    // 装备：每件占一格
    let empty = 0;
    for (const s of inv.slots) if (s === null) empty++;
    return empty >= count;
  }
}

export default {
  canEquip,
  equipItem,
  unequipItem,
  useItem,
  dropItem,
  stackItem,
  repairItem,
  repairAll,
  sellItem,
  buyItem,
};
