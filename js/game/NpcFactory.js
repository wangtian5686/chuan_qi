/**
 * NpcFactory.js — NPC 工厂
 *
 * 根据 config.type 创建 Npc 实例，并在 config 未提供 shop 时
 * 自动注入对应类型的默认商店配置（NPC_SHOPS）。
 */

import { Npc, NPC_SHOPS } from './Npc.js';

/**
 * 创建 NPC 实例
 * @param {object} config NPC 配置 {id, x, y, name, type, shop?}
 * @param {object} map IsometricMap 实例
 * @returns {Npc}
 */
export function createNpc(config, map) {
  // config 未提供 shop 时，注入默认商店配置（浅拷贝条目，避免污染字典）
  if (config && !Array.isArray(config.shop)) {
    const def = NPC_SHOPS[config.type];
    config = {
      ...config,
      shop: def ? def.map((e) => ({ ...e })) : [],
    };
  }
  return new Npc(config, map);
}

export default createNpc;
