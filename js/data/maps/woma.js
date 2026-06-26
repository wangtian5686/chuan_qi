/**
 * woma.js — 沃玛寺庙（40×60，单图分上下两层）
 *
 * 布局：
 * - 上半 y∈[0,29] 入口层：DARK_GRASS 暗黑地面 + STONE 入口石路
 *   刷新 woma_guard×4、woma_warrior×4、woma_priest×2
 * - 下半 y∈[30,59] BOSS 层：LAVA 岩浆地面， carved STONE 甬道形成迷宫
 *   WALL 封堵若干支路；BOSS 房 STONE 围墙仅留一入口，刷新 woma_warrior×6 + woma_boss×1
 * - 楼层间 PORTAL 传送（上半底部 ↔ 下半顶部）
 * - 顶部出口 → 比奇城
 * - 全图无安全区
 *
 * 说明：LAVA 地面本身不可走，故 BOSS 层在 LAVA 中 carve 出 STONE 甬道供行走，
 *      其余 LAVA 区域天然阻挡，形成"岩浆迷宫"效果。
 */

import { TILE } from '../tiles.js';
import {
  createEmpty,
  fillRect,
  roomBorder,
  setWalkableFromLayers,
  ensureWalkable,
  setObject,
} from './_mapgen.js';

const W = 40;
const H = 60;
const SPLIT_Y = 30; // 上下层分界（下半从 y=30 起）

export function createWomaMap() {
  const base = createEmpty(W, H, TILE.DARK_GRASS);
  const { groundLayer, objectLayer } = base;

  // ===== 上半：入口层 =====
  // STONE 入口石路（纵向，x=18..21）
  fillRect(groundLayer, 18, 0, 4, SPLIT_Y, TILE.STONE);

  // ===== 下半：BOSS 层 =====
  // 整层铺 LAVA
  fillRect(groundLayer, 0, SPLIT_Y, W, H - SPLIT_Y, TILE.LAVA);
  // STONE 主干甬道（纵向 x=19..20）
  fillRect(groundLayer, 19, SPLIT_Y, 2, H - SPLIT_Y, TILE.STONE);
  // STONE 横向支路
  fillRect(groundLayer, 2, 37, 36, 1, TILE.STONE);
  fillRect(groundLayer, 2, 45, 36, 1, TILE.STONE);
  fillRect(groundLayer, 2, 53, 36, 1, TILE.STONE);
  // BOSS 房 STONE 地面（x=15..25, y=46..55）
  fillRect(groundLayer, 15, 46, 11, 10, TILE.STONE);

  // 迷宫墙：在 STONE 支路上设墙段形成死胡同（保留主干畅通）
  fillRect(objectLayer, 5, 37, 4, 1, TILE.WALL_H);   // y=37 西段墙
  fillRect(objectLayer, 30, 37, 5, 1, TILE.WALL_H);  // y=37 东段墙
  fillRect(objectLayer, 5, 45, 5, 1, TILE.WALL_H);   // y=45 西段墙
  fillRect(objectLayer, 28, 45, 6, 1, TILE.WALL_H);  // y=45 东段墙
  fillRect(objectLayer, 8, 53, 4, 1, TILE.WALL_H);   // y=53 西段墙
  fillRect(objectLayer, 30, 53, 5, 1, TILE.WALL_H);  // y=53 东段墙
  fillRect(objectLayer, 10, 38, 1, 6, TILE.WALL_V);  // 纵向墙
  fillRect(objectLayer, 30, 38, 1, 6, TILE.WALL_V);

  // BOSS 房围墙，入口在顶部 (20,46) → pos = 20-15 = 5
  roomBorder(
    objectLayer, 15, 46, 11, 10,
    TILE.WALL_H, TILE.WALL_V, TILE.WALL_CORNER,
    { side: 'top', pos: 5 }
  );

  // ===== 怪物刷新点 =====
  const spawns = [
    // 上半
    { x: 8, y: 8, monsterId: 'woma_guard', count: 2, respawnMs: 60000 },
    { x: 30, y: 12, monsterId: 'woma_guard', count: 2, respawnMs: 60000 },
    { x: 30, y: 5, monsterId: 'woma_warrior', count: 2, respawnMs: 60000 },
    { x: 8, y: 20, monsterId: 'woma_warrior', count: 2, respawnMs: 60000 },
    { x: 15, y: 18, monsterId: 'woma_priest', count: 1, respawnMs: 60000 },
    { x: 28, y: 22, monsterId: 'woma_priest', count: 1, respawnMs: 60000 },
    // 下半
    { x: 12, y: 37, monsterId: 'woma_warrior', count: 3, respawnMs: 60000 },
    { x: 15, y: 45, monsterId: 'woma_warrior', count: 3, respawnMs: 60000 },
    { x: 20, y: 51, monsterId: 'woma_boss', count: 1, respawnMs: 7200000 },
  ];

  // ===== 传送点 =====
  const teleports = [
    { x: 20, y: 1, targetMap: 'bicicheng', targetX: 30, targetY: 7, label: '前往比奇城' },
    { x: 20, y: 29, targetMap: 'woma', targetX: 20, targetY: 35, label: '通往底层' },
    { x: 20, y: 36, targetMap: 'woma', targetX: 20, targetY: 25, label: '通往上层' },
  ];

  const playerStart = { x: 20, y: 3 };

  const mapData = {
    id: 'woma',
    name: '沃玛寺庙',
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

  // 放置 PORTAL 视觉
  for (const t of teleports) setObject(mapData, t.x, t.y, TILE.PORTAL);

  // 确保关键点可行走
  ensureWalkable(mapData, playerStart.x, playerStart.y, TILE.STONE);
  for (const t of teleports) ensureWalkable(mapData, t.x, t.y, TILE.STONE);
  for (const s of spawns) ensureWalkable(mapData, s.x, s.y, TILE.STONE);
  // 重新放置 PORTAL
  for (const t of teleports) setObject(mapData, t.x, t.y, TILE.PORTAL);

  // 重算通行性
  setWalkableFromLayers(mapData);

  return mapData;
}

export const WOMA_MAP = createWomaMap();

export default WOMA_MAP;
