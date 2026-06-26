/**
 * index.js — 地图数据汇总入口
 *
 * 统一导出五张主地图，并提供 MAPS 字典与 getMap(id) 查询函数。
 * 各地图在模块加载时由 createXxxMap() 过程化生成。
 */

export { BICICHENG_MAP } from './bicicheng.js';
export { MENGZHONG_MAP } from './mengzhong.js';
export { WOMA_MAP } from './woma.js';
export { ZUMA_MAP } from './zuma.js';
export { CHIYUE_MAP } from './chiyue.js';

import { BICICHENG_MAP } from './bicicheng.js';
import { MENGZHONG_MAP } from './mengzhong.js';
import { WOMA_MAP } from './woma.js';
import { ZUMA_MAP } from './zuma.js';
import { CHIYUE_MAP } from './chiyue.js';

/** 地图字典：id → mapData */
export const MAPS = {
  bicicheng: BICICHENG_MAP,
  mengzhong: MENGZHONG_MAP,
  woma: WOMA_MAP,
  zuma: ZUMA_MAP,
  chiyue: CHIYUE_MAP,
};

/**
 * 按 id 获取地图数据
 * @param {string} id 地图 id
 * @returns {object|undefined}
 */
export function getMap(id) {
  return MAPS[id];
}

export default MAPS;
