/**
 * tiles.js — 瓦片 ID 常量、占位色与可行走性定义
 *
 * 约定：
 * - 地面层瓦片 ID 在 1~99 区间，使用纯色填充作为占位
 * - 物体层瓦片 ID 在 100+ 区间，使用半透明色块表示遮挡物
 *   （真实资源接入后改用 AssetLoader.getImage(`tile_${id}`) 取图）
 * - isTileWalkable(tileId) 仅描述"该物体瓦片本身是否阻挡行走"，
 *   地面层是否可走由地图的 walkable 数组决定；二者结合判断最终通行性。
 */

/** 瓦片 ID 常量 */
export const TILE = {
  // ---- 地面层 ----
  GRASS: 1,      // 草地
  DIRT: 2,       // 泥土
  STONE: 3,      // 石板
  WATER: 4,      // 水面（阻挡行走）
  SAND: 5,       // 沙地
  WOOD: 6,       // 木地板
  COBBLE: 7,     // 鹅卵石
  LAVA: 8,       // 岩浆（阻挡行走）
  DARK_GRASS: 9, // 深色草地
  SNOW: 10,      // 雪地

  // ---- 物体层（遮挡物）----
  TREE: 101,         // 树木
  ROCK: 102,         // 岩石
  WALL_H: 103,       // 横向墙体
  WALL_V: 104,       // 纵向墙体
  WALL_CORNER: 105,  // 墙角
  BUILDING: 110,     // 建筑
  FENCE: 111,        // 栅栏
  BUSH: 112,         // 灌木
  TORCH: 113,        // 火把

  // ---- 特殊层 ----
  PORTAL: 200,    // 传送光圈（地面装饰，可踩）
  NPC_BASE: 201,  // NPC 站立底座标记（可踩）
};

/**
 * 各瓦片 ID 对应的占位色
 * - 地面层（<100）：纯色
 * - 物体层（>=100）：rgba 半透明色，便于在画面中区分前后关系
 */
export const TILE_COLORS = {
  // 地面层
  [TILE.GRASS]: '#3a7a32',
  [TILE.DIRT]: '#7a5a2a',
  [TILE.STONE]: '#8a8a8a',
  [TILE.WATER]: '#3a5a8a',
  [TILE.SAND]: '#d8c878',
  [TILE.WOOD]: '#9a6a3a',
  [TILE.COBBLE]: '#6a6a6a',
  [TILE.LAVA]: '#c8401a',
  [TILE.DARK_GRASS]: '#2a5a22',
  [TILE.SNOW]: '#e8e8f0',

  // 物体层（半透明色，使下方地面隐约可见，遮挡关系更直观）
  [TILE.TREE]: 'rgba(20, 80, 20, 0.85)',
  [TILE.ROCK]: 'rgba(90, 90, 95, 0.9)',
  [TILE.WALL_H]: 'rgba(70, 60, 50, 0.95)',
  [TILE.WALL_V]: 'rgba(70, 60, 50, 0.95)',
  [TILE.WALL_CORNER]: 'rgba(90, 75, 60, 0.95)',
  [TILE.BUILDING]: 'rgba(120, 80, 40, 0.95)',
  [TILE.FENCE]: 'rgba(110, 80, 40, 0.85)',
  [TILE.BUSH]: 'rgba(40, 100, 40, 0.8)',
  [TILE.TORCH]: 'rgba(220, 140, 30, 0.95)',

  // 特殊层
  [TILE.PORTAL]: 'rgba(120, 80, 220, 0.7)',
  [TILE.NPC_BASE]: 'rgba(200, 200, 60, 0.6)',
};

/** 阻挡行走的地面层 ID 集合（如水面、岩浆） */
const BLOCKING_GROUND = new Set([TILE.WATER, TILE.LAVA]);

/**
 * 判断物体层瓦片是否阻挡行走
 * @param {number} tileId 物体层瓦片 ID（0 表示空，可走）
 * @returns {boolean} true 表示该瓦片本身阻挡行走
 */
export function isTileWalkable(tileId) {
  if (!tileId) return true; // 空物体层，不阻挡
  // PORTAL、NPC_BASE 是地面装饰，不阻挡
  if (tileId === TILE.PORTAL || tileId === TILE.NPC_BASE) return true;
  // 100+ 物体层（除上述例外）均视为阻挡
  if (tileId >= 100) return false;
  // 1~99 地面层中部分类型本身阻挡
  return !BLOCKING_GROUND.has(tileId);
}

export default TILE;
