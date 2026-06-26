/**
 * mengzhong.js — 盟重省（野外，80×80）
 *
 * 布局：
 * - GRASS 为主，DIRT 十字主路 + 西南支路，几片 SAND 沙地
 * - 一条 WATER 对角河带（不可走）
 * - 散布 TREE/ROCK 营造野外感
 * - 低级怪刷新点 7 处（多钩猫/钉耙猫/黑猪/红猪）
 * - 三处传送：北→比奇城，东→祖玛阁，西南→赤月峡谷
 * - 无安全区（野外）
 */

import { TILE } from '../tiles.js';
import {
  createEmpty,
  fillRect,
  carveCircle,
  scatter,
  setWalkableFromLayers,
  ensureWalkable,
  setObject,
} from './_mapgen.js';

const W = 80;
const H = 80;

// 道路、河流、传送点坐标
const ROAD_V_X0 = 39, ROAD_V_X1 = 41;       // 纵向主路
const ROAD_H_Y0 = 39, ROAD_H_Y1 = 41;       // 横向主路
const ROAD_SW_Y = 73;                        // 西南支路（连接 SW 传送）

export function createMengzhongMap() {
  const base = createEmpty(W, H, TILE.GRASS);
  const { groundLayer, objectLayer } = base;

  // 1. DIRT 主路：纵向 + 横向十字
  fillRect(groundLayer, ROAD_V_X0, 2, ROAD_V_X1 - ROAD_V_X0 + 1, H - 4, TILE.DIRT);
  fillRect(groundLayer, 2, ROAD_H_Y0, W - 4, ROAD_H_Y1 - ROAD_H_Y0 + 1, TILE.DIRT);
  // 西南支路：从纵向主路(x=40)向西到 SW 传送(x=5)
  fillRect(groundLayer, 5, ROAD_SW_Y, 40 - 5 + 1, 2, TILE.DIRT);

  // 2. SAND 沙地几片
  carveCircle(groundLayer, 15, 15, 4, TILE.SAND);
  carveCircle(groundLayer, 65, 20, 5, TILE.SAND);
  carveCircle(groundLayer, 20, 60, 4, TILE.SAND);
  carveCircle(groundLayer, 62, 62, 5, TILE.SAND);

  // 3. WATER 对角河带：y = 50 + (x-5)*0.4，x∈[5,75]，宽 2
  //    遇 DIRT 路面则跳过（形成天然桥），保证道路连通
  for (let x = 5; x <= 75; x++) {
    const y = Math.round(50 + (x - 5) * 0.4);
    for (const yy of [y, y + 1]) {
      if (yy >= 0 && yy < H && groundLayer[yy][x] !== TILE.DIRT) {
        groundLayer[yy][x] = TILE.WATER;
      }
    }
  }

  // 4. 怪物刷新点
  const spawns = [
    { x: 15, y: 10, monsterId: 'duogou_cat', count: 4, respawnMs: 60000 },
    { x: 65, y: 15, monsterId: 'dingba_cat', count: 4, respawnMs: 60000 },
    { x: 20, y: 65, monsterId: 'black_pig', count: 3, respawnMs: 60000 },
    { x: 70, y: 70, monsterId: 'red_pig', count: 2, respawnMs: 60000 },
    { x: 60, y: 50, monsterId: 'duogou_cat', count: 3, respawnMs: 60000 },
    { x: 10, y: 35, monsterId: 'black_pig', count: 3, respawnMs: 60000 },
    { x: 50, y: 25, monsterId: 'dingba_cat', count: 2, respawnMs: 60000 },
  ];

  // 5. 传送点
  const teleports = [
    { x: 40, y: 3, targetMap: 'bicicheng', targetX: 30, targetY: 52, label: '前往比奇城' },
    { x: 76, y: 40, targetMap: 'zuma', targetX: 2, targetY: 3, label: '前往祖玛阁' },
    { x: 5, y: 74, targetMap: 'chiyue', targetX: 30, targetY: 4, label: '前往赤月峡谷' },
  ];

  const playerStart = { x: 40, y: 40 };

  // 组装 mapData
  const mapData = {
    id: 'mengzhong',
    name: '盟重省',
    width: W,
    height: H,
    groundLayer,
    objectLayer,
    walkable: base.walkable,
    safeZone: [],
    spawns,
    npcs: [],
    teleports,
    playerStart,
  };

  // 6. 散布 TREE / ROCK，避开道路/河流/关键点（含 1 格缓冲）
  const protectedSet = new Set();
  const protect = (x, y) => {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) protectedSet.add(`${x + dx},${y + dy}`);
  };
  protect(playerStart.x, playerStart.y);
  for (const t of teleports) protect(t.x, t.y);
  for (const s of spawns) protect(s.x, s.y);

  const avoid = (x, y) => {
    if (protectedSet.has(`${x},${y}`)) return true;
    const g = groundLayer[y][x];
    // 不在 DIRT 路面与 WATER 河流上种树
    if (g === TILE.DIRT || g === TILE.WATER) return true;
    return false;
  };
  scatter(objectLayer, 55, TILE.TREE, avoid);
  scatter(objectLayer, 28, TILE.ROCK, avoid);

  // 7. 放置 PORTAL 视觉
  for (const t of teleports) setObject(mapData, t.x, t.y, TILE.PORTAL);

  // 8. 确保关键点可行走
  ensureWalkable(mapData, playerStart.x, playerStart.y, TILE.DIRT);
  for (const t of teleports) ensureWalkable(mapData, t.x, t.y, TILE.GRASS);
  for (const s of spawns) ensureWalkable(mapData, s.x, s.y, TILE.GRASS);
  // 重新放置 PORTAL（ensureWalkable 会清物体层）
  for (const t of teleports) setObject(mapData, t.x, t.y, TILE.PORTAL);

  // 9. 重算通行性
  setWalkableFromLayers(mapData);

  return mapData;
}

export const MENGZHONG_MAP = createMengzhongMap();

export default MENGZHONG_MAP;
