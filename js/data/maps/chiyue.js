/**
 * chiyue.js — 赤月峡谷（高难野外，60×60）
 *
 * 布局：
 * - DARK_GRASS 主色，东北 SNOW 高地区域，中南部 LAVA 河流，东侧 LAVA 池
 * - 散布高级怪：zuma_statue×4、moon_spider×4、blood_giant×4、black_spider×4
 * - 中央 BOSS 房（围墙仅留一入口），刷新 chiyue_boss
 * - 无安全区
 * - 顶部入口传送 → 盟重省
 */

import { TILE } from '../tiles.js';
import {
  createEmpty,
  fillRect,
  carveCircle,
  roomBorder,
  setWalkableFromLayers,
  ensureWalkable,
  setObject,
} from './_mapgen.js';

const W = 60;
const H = 60;

export function createChiyueMap() {
  const base = createEmpty(W, H, TILE.DARK_GRASS);
  const { groundLayer, objectLayer } = base;

  // 1. 东北 SNOW 高地
  fillRect(groundLayer, 44, 0, W - 44, 17, TILE.SNOW);
  carveCircle(groundLayer, 50, 8, 8, TILE.SNOW); // 圆化边缘

  // 2. LAVA 河流：y = 45 + x*10/59，x∈[0,59]，宽 2（中南部横贯）
  for (let x = 0; x < W; x++) {
    const y = Math.round(45 + (x * 10) / 59);
    if (y >= 0 && y < H) groundLayer[y][x] = TILE.LAVA;
    if (y + 1 >= 0 && y + 1 < H) groundLayer[y + 1][x] = TILE.LAVA;
  }
  // 东侧 LAVA 池
  carveCircle(groundLayer, 48, 30, 3, TILE.LAVA);

  // 3. 中央 BOSS 房（x=26..34, y=26..34），入口顶部 (30,26)
  roomBorder(
    objectLayer, 26, 26, 9, 9,
    TILE.WALL_H, TILE.WALL_V, TILE.WALL_CORNER,
    { side: 'top', pos: 4 } // pos = 30-26
  );

  // 4. 怪物刷新点
  const spawns = [
    { x: 50, y: 5, monsterId: 'zuma_statue', count: 2, respawnMs: 60000 },
    { x: 10, y: 10, monsterId: 'zuma_statue', count: 2, respawnMs: 60000 },
    { x: 53, y: 25, monsterId: 'moon_spider', count: 2, respawnMs: 60000 },
    { x: 15, y: 45, monsterId: 'moon_spider', count: 2, respawnMs: 60000 },
    { x: 40, y: 50, monsterId: 'blood_giant', count: 2, respawnMs: 60000 },
    { x: 8, y: 30, monsterId: 'blood_giant', count: 2, respawnMs: 60000 },
    { x: 22, y: 52, monsterId: 'black_spider', count: 2, respawnMs: 60000 },
    { x: 48, y: 20, monsterId: 'black_spider', count: 2, respawnMs: 60000 },
    { x: 30, y: 30, monsterId: 'chiyue_boss', count: 1, respawnMs: 21600000 },
  ];

  // 5. 传送点（顶部入口）
  const teleports = [
    { x: 30, y: 1, targetMap: 'mengzhong', targetX: 7, targetY: 73, label: '前往盟重省' },
  ];

  const playerStart = { x: 30, y: 2 };

  const mapData = {
    id: 'chiyue',
    name: '赤月峡谷',
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

  // 6. 放置 PORTAL 视觉
  for (const t of teleports) setObject(mapData, t.x, t.y, TILE.PORTAL);

  // 7. 确保关键点可行走
  ensureWalkable(mapData, playerStart.x, playerStart.y, TILE.DARK_GRASS);
  for (const t of teleports) ensureWalkable(mapData, t.x, t.y, TILE.DARK_GRASS);
  for (const s of spawns) ensureWalkable(mapData, s.x, s.y, TILE.DARK_GRASS);
  for (const t of teleports) setObject(mapData, t.x, t.y, TILE.PORTAL);

  // 8. 重算通行性
  setWalkableFromLayers(mapData);

  return mapData;
}

export const CHIYUE_MAP = createChiyueMap();

export default CHIYUE_MAP;
