/**
 * zuma.js — 祖玛阁（迷宫式，50×50）
 *
 * 布局：
 * - STONE 地面
 * - 外围一圈城墙，左上角顶部留入口
 * - 内部手工主干墙 + 随机分支墙形成迷宫
 * - 中央 BOSS 房（围墙仅留一入口），刷新 zuma_boss
 * - 怪物：zuma_guard×6、zuma_archer×4、zuma_statue×3、moon_spider×3、blood_giant×2
 * - 无安全区
 * - 左上角入口传送 → 盟重省
 */

import { TILE } from '../tiles.js';
import {
  createEmpty,
  fillRect,
  roomBorder,
  scatter,
  setWalkableFromLayers,
  ensureWalkable,
  setObject,
} from './_mapgen.js';

const W = 50;
const H = 50;

export function createZumaMap() {
  const base = createEmpty(W, H, TILE.STONE);
  const { groundLayer, objectLayer } = base;

  // 1. 外围城墙（顶部 x=2 处留入口缺口）
  roomBorder(
    objectLayer, 0, 0, W, H,
    TILE.WALL_H, TILE.WALL_V, TILE.WALL_CORNER,
    { side: 'top', pos: 2 }
  );

  // 2. 内部主干墙（带缺口保证连通）
  fillRect(objectLayer, 15, 18, 7, 1, TILE.WALL_H);   // y=18 西段（x=15..21）
  fillRect(objectLayer, 29, 18, 21, 1, TILE.WALL_H);  // y=18 东段（x=29..49），缺口 x=22..28 通 BOSS 房入口
  fillRect(objectLayer, 0, 12, 21, 1, TILE.WALL_H);   // y=12 西段
  fillRect(objectLayer, 0, 35, 31, 1, TILE.WALL_H);   // y=35 西段
  fillRect(objectLayer, 15, 0, 1, 19, TILE.WALL_V);   // x=15 上段
  fillRect(objectLayer, 32, 18, 1, 32, TILE.WALL_V);  // x=32 下段

  // 3. BOSS 房（x=22..28, y=22..28），入口顶部 (25,22)
  roomBorder(
    objectLayer, 22, 22, 7, 7,
    TILE.WALL_H, TILE.WALL_V, TILE.WALL_CORNER,
    { side: 'top', pos: 3 } // pos = 25-22
  );

  // 4. 怪物刷新点
  const spawns = [
    { x: 5, y: 5, monsterId: 'zuma_guard', count: 3, respawnMs: 60000 },
    { x: 40, y: 40, monsterId: 'zuma_guard', count: 3, respawnMs: 60000 },
    { x: 40, y: 5, monsterId: 'zuma_archer', count: 2, respawnMs: 60000 },
    { x: 5, y: 40, monsterId: 'zuma_archer', count: 2, respawnMs: 60000 },
    { x: 35, y: 15, monsterId: 'zuma_statue', count: 3, respawnMs: 60000 },
    { x: 10, y: 30, monsterId: 'moon_spider', count: 3, respawnMs: 60000 },
    { x: 20, y: 40, monsterId: 'blood_giant', count: 2, respawnMs: 60000 },
    { x: 25, y: 25, monsterId: 'zuma_boss', count: 1, respawnMs: 14400000 },
  ];

  // 5. 传送点（左上角入口）
  const teleports = [
    { x: 2, y: 1, targetMap: 'mengzhong', targetX: 74, targetY: 40, label: '前往盟重省' },
  ];

  const playerStart = { x: 2, y: 2 };

  const mapData = {
    id: 'zuma',
    name: '祖玛阁',
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

  // 6. 随机分支墙（避开 BOSS 房、关键点、已有墙）
  const protectedSet = new Set();
  const protect = (x, y) => protectedSet.add(`${x},${y}`);
  // BOSS 房区域缓冲
  for (let y = 21; y <= 29; y++)
    for (let x = 21; x <= 29; x++) protect(x, y);
  protect(playerStart.x, playerStart.y);
  for (const t of teleports) { protect(t.x, t.y); protect(t.x + 1, t.y); }
  for (const s of spawns) protect(s.x, s.y);

  scatter(objectLayer, 25, TILE.WALL_H, (x, y) => {
    if (protectedSet.has(`${x},${y}`)) return true;
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return true; // 不在边界
    if (objectLayer[y][x] !== 0) return true;
    return false;
  });
  scatter(objectLayer, 15, TILE.WALL_V, (x, y) => {
    if (protectedSet.has(`${x},${y}`)) return true;
    if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return true;
    if (objectLayer[y][x] !== 0) return true;
    return false;
  });

  // 7. 放置 PORTAL 视觉
  for (const t of teleports) setObject(mapData, t.x, t.y, TILE.PORTAL);

  // 8. 确保关键点可行走
  ensureWalkable(mapData, playerStart.x, playerStart.y, TILE.STONE);
  for (const t of teleports) ensureWalkable(mapData, t.x, t.y, TILE.STONE);
  for (const s of spawns) ensureWalkable(mapData, s.x, s.y, TILE.STONE);
  for (const t of teleports) setObject(mapData, t.x, t.y, TILE.PORTAL);

  // 9. 重算通行性
  setWalkableFromLayers(mapData);

  return mapData;
}

export const ZUMA_MAP = createZumaMap();

export default ZUMA_MAP;
