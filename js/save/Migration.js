/**
 * Migration.js — 存档版本迁移工具
 *
 * 职责：
 * - 维护当前存档格式版本号 CURRENT_VERSION
 * - migrate(data)：将旧版本存档数据逐步迁移到当前版本
 * - isCompatible(data)：判断存档版本是否可被识别与迁移
 *
 * 设计原则：
 * - 迁移函数链式向上（1→2→3…），每一步只处理相邻版本差异
 * - 高于 CURRENT_VERSION 的存档视为不兼容（避免新存档在旧程序上被错误截断）
 * - 迁移失败不应抛异常，由调用方根据返回值判断
 */

/** 当前存档格式版本 */
export const CURRENT_VERSION = 1;

/**
 * 将存档数据迁移到当前版本
 * - 仅原地/浅拷贝处理，不改动已是最新的存档
 * - 若 data 缺少 version 字段，按"未知"处理直接返回
 * @param {object} data 存档数据
 * @returns {object} 迁移后的存档数据
 */
export function migrate(data) {
  if (!data || typeof data !== 'object') return data;
  if (typeof data.version !== 'number') return data;

  // 链式迁移示例（当前仅 version 1，预留扩展点）：
  // while (data.version < CURRENT_VERSION) {
  //   switch (data.version) {
  //     case 1: data = _migrateV1ToV2(data); break;
  //     case 2: data = _migrateV2ToV3(data); break;
  //     default: return data; // 未知版本，停止迁移
  //   }
  // }
  return data;
}

/**
 * 检查存档版本是否可迁移
 * - 必须是对象且 version 为数字
 * - version 在 [1, CURRENT_VERSION] 区间内视为可迁移
 * @param {object} data 存档数据
 * @returns {boolean}
 */
export function isCompatible(data) {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.version !== 'number') return false;
  return data.version >= 1 && data.version <= CURRENT_VERSION;
}

/** 默认导出聚合对象，便于 `import Migration from './Migration.js'` */
export default { CURRENT_VERSION, migrate, isCompatible };
