/**
 * _mapgen.js — 地图过程化生成辅助函数库
 *
 * 提供创建空地图、矩形/圆形填充、边界填充、随机散布、房间边框、
 * 通行性重算等通用工具，供 maps 目录下各地图文件使用。
 *
 * 约定：
 * - layer 为二维数组 layer[y][x]（y 为行，x 为列），与 IsometricMap 一致
 * - 物体层空值用 0 表示
 * - tileId 取自 tiles.js 的 TILE 常量
 */

import { TILE, isTileWalkable } from '../tiles.js';

/**
 * 创建空地图的三层结构
 * @param {number} width 宽（列数）
 * @param {number} height 高（行数）
 * @param {number} groundTile 默认地面瓦片（默认 GRASS）
 * @returns {{width:number,height:number,groundLayer:number[][],objectLayer:number[][],walkable:boolean[][]}}
 */
export function createEmpty(width, height, groundTile = TILE.GRASS) {
  const groundLayer = [];
  const objectLayer = [];
  const walkable = [];
  const groundWalkable = isTileWalkable(groundTile);
  for (let y = 0; y < height; y++) {
    groundLayer.push(new Array(width).fill(groundTile));
    objectLayer.push(new Array(width).fill(0));
    walkable.push(new Array(width).fill(groundWalkable));
  }
  return { width, height, groundLayer, objectLayer, walkable };
}

/**
 * 矩形填充（越界自动裁剪）
 * @param {number[][]} layer 目标层（ground 或 object）
 * @param {number} x 左上角列
 * @param {number} y 左上角行
 * @param {number} w 宽
 * @param {number} h 高
 * @param {number} tileId 瓦片 ID
 */
export function fillRect(layer, x, y, w, h, tileId) {
  const H = layer.length;
  for (let dy = 0; dy < h; dy++) {
    const py = y + dy;
    if (py < 0 || py >= H) continue;
    const row = layer[py];
    for (let dx = 0; dx < w; dx++) {
      const px = x + dx;
      if (px < 0 || px >= row.length) continue;
      row[px] = tileId;
    }
  }
}

/**
 * 沿层最外圈填充一圈瓦片（用于地图边界墙）
 * @param {number[][]} layer
 * @param {number} tileId
 */
export function fillBorder(layer, tileId) {
  const H = layer.length;
  if (H === 0) return;
  const W = layer[0].length;
  for (let x = 0; x < W; x++) {
    layer[0][x] = tileId;
    layer[H - 1][x] = tileId;
  }
  for (let y = 0; y < H; y++) {
    layer[y][0] = tileId;
    layer[y][W - 1] = tileId;
  }
}

/**
 * 圆形区域填充
 * @param {number[][]} layer
 * @param {number} cx 圆心列
 * @param {number} cy 圆心行
 * @param {number} r 半径
 * @param {number} tileId
 */
export function carveCircle(layer, cx, cy, r, tileId) {
  const H = layer.length;
  if (H === 0) return;
  const W = layer[0].length;
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    if (y < 0 || y >= H) continue;
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || x >= W) continue;
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        layer[y][x] = tileId;
      }
    }
  }
}

/**
 * 随机散布瓦片（仅放置在当前为空 0 的格子上，避免覆盖已有物体/墙）
 * @param {number[][]} layer 目标层（通常为 objectLayer）
 * @param {number} count 目标数量
 * @param {number} tileId 要散布的瓦片 ID
 * @param {(x:number,y:number)=>boolean} [avoid] 返回 true 表示跳过该格
 */
export function scatter(layer, count, tileId, avoid) {
  const H = layer.length;
  if (H === 0) return;
  const W = layer[0].length;
  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 30;
  while (placed < count && attempts < maxAttempts) {
    attempts++;
    const x = Math.floor(Math.random() * W);
    const y = Math.floor(Math.random() * H);
    if (layer[y][x] !== 0) continue; // 不覆盖已有物体
    if (avoid && avoid(x, y)) continue;
    layer[y][x] = tileId;
    placed++;
  }
}

/**
 * 给房间/区域绘制墙体边框，可指定一个入口缺口
 * @param {number[][]} layer 物体层
 * @param {number} x 左上角列
 * @param {number} y 左上角行
 * @param {number} w 宽
 * @param {number} h 高
 * @param {number} wallH 横向墙瓦片
 * @param {number} wallV 纵向墙瓦片
 * @param {number} corner 墙角瓦片
 * @param {{side:'top'|'bottom'|'left'|'right', pos:number}} [entrance] 入口位置
 */
export function roomBorder(layer, x, y, w, h, wallH, wallV, corner, entrance = null) {
  for (let i = 0; i < w; i++) {
    const topBlock = entrance && entrance.side === 'top' && i === entrance.pos;
    const botBlock = entrance && entrance.side === 'bottom' && i === entrance.pos;
    if (!topBlock) layer[y][x + i] = wallH;
    if (!botBlock) layer[y + h - 1][x + i] = wallH;
  }
  for (let j = 0; j < h; j++) {
    const leftBlock = entrance && entrance.side === 'left' && j === entrance.pos;
    const rightBlock = entrance && entrance.side === 'right' && j === entrance.pos;
    if (!leftBlock) layer[y + j][x] = wallV;
    if (!rightBlock) layer[y + j][x + w - 1] = wallV;
  }
  // 四角强制覆盖为墙角
  layer[y][x] = corner;
  layer[y][x + w - 1] = corner;
  layer[y + h - 1][x] = corner;
  layer[y + h - 1][x + w - 1] = corner;
}

/**
 * 设置地面层瓦片
 */
export function setGround(mapData, x, y, tileId) {
  mapData.groundLayer[y][x] = tileId;
}

/**
 * 设置物体层瓦片
 */
export function setObject(mapData, x, y, tileId) {
  mapData.objectLayer[y][x] = tileId;
}

/**
 * 清除物体层（置 0）
 */
export function clearObject(mapData, x, y) {
  mapData.objectLayer[y][x] = 0;
}

/**
 * 确保指定格子可行走：若地面阻挡则替换为 fallbackGround，并清除物体层
 * 用于保证玩家起点、传送点、怪物刷新点、NPC 位置可走
 * @param {object} mapData
 * @param {number} x
 * @param {number} y
 * @param {number} [fallbackGround=TILE.STONE] 地面阻挡时使用的替代地面
 */
export function ensureWalkable(mapData, x, y, fallbackGround = TILE.STONE) {
  if (!isTileWalkable(mapData.groundLayer[y][x])) {
    mapData.groundLayer[y][x] = fallbackGround;
  }
  mapData.objectLayer[y][x] = 0;
}

/**
 * 根据 groundLayer/objectLayer 与 isTileWalkable 重新生成 walkable 数组
 * 规则：地面可走 且 物体层可走 → 该格可走
 * @param {object} mapData
 */
export function setWalkableFromLayers(mapData) {
  const { width, height, groundLayer, objectLayer } = mapData;
  const walkable = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const g = groundLayer[y][x];
      const o = objectLayer[y][x];
      row.push(isTileWalkable(g) && isTileWalkable(o));
    }
    walkable.push(row);
  }
  mapData.walkable = walkable;
  return walkable;
}

/**
 * 校验单个格子是否可行走（读 walkable 数组）
 */
export function isWalkableAt(mapData, x, y) {
  if (!mapData.walkable[y]) return false;
  return !!mapData.walkable[y][x];
}

export { TILE };
