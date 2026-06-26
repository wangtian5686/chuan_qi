/**
 * bicicheng.js — 比奇城（主城，60×60）
 *
 * 布局：
 * - 外围 GRASS 草地，城内 COBBLE 鹅卵石
 * - 城墙矩形 x∈[5,54], y∈[5,54]，四角 WALL_CORNER，南北各留 2 格城门
 * - 城内四角 4 座 BUILDING（武器店/服装店/药店/铁匠）
 * - 中央 PORTAL 站传送员，南门通盟重省，北门通沃玛寺庙
 * - 整个城内为安全区
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

const W = 60;
const H = 60;

// 城墙范围（含墙线）
const CITY_X0 = 5, CITY_Y0 = 5, CITY_X1 = 54, CITY_Y1 = 54;
// 城门开口（南北各 2 格）
const GATE_X_MIN = 29, GATE_X_MAX = 30;

// 4 座建筑定义（左上角 x,y 与宽高）
const BUILDINGS = [
  { name: 'weaponShop', x: 10, y: 10, w: 7, h: 5 },   // 武器店（西北）
  { name: 'clothShop', x: 43, y: 10, w: 7, h: 5 },    // 服装店（东北）
  { name: 'potionShop', x: 10, y: 45, w: 7, h: 5 },   // 药店（西南）
  { name: 'blacksmith', x: 43, y: 45, w: 7, h: 5 },   // 铁匠（东南）
];

export function createBicichengMap() {
  const base = createEmpty(W, H, TILE.GRASS);
  const { groundLayer, objectLayer } = base;

  // 1. 城内地面铺 COBBLE
  fillRect(groundLayer, CITY_X0, CITY_Y0, CITY_X1 - CITY_X0 + 1, CITY_Y1 - CITY_Y0 + 1, TILE.COBBLE);
  // 城门外延伸一小段 COBBLE 引路
  fillRect(groundLayer, GATE_X_MIN, CITY_Y0 - 3, GATE_X_MAX - GATE_X_MIN + 1, 3, TILE.COBBLE); // 北门外
  fillRect(groundLayer, GATE_X_MIN, CITY_Y1 + 1, GATE_X_MAX - GATE_X_MIN + 1, 3, TILE.COBBLE); // 南门外

  // 2. 城墙边框：南北用 WALL_H，东西用 WALL_V，四角 WALL_CORNER
  //    南北门位置（top/bottom 的 pos）开缺口
  roomBorder(
    objectLayer,
    CITY_X0, CITY_Y0,
    CITY_X1 - CITY_X0 + 1, CITY_Y1 - CITY_Y0 + 1,
    TILE.WALL_H, TILE.WALL_V, TILE.WALL_CORNER,
    { side: 'top', pos: GATE_X_MIN - CITY_X0 } // 北门缺口（另一格在 next，手动补缺）
  );
  // roomBorder 仅开一个缺口，再手动开第二格门洞
  objectLayer[CITY_Y0][GATE_X_MAX] = 0;                 // 北门第二格
  objectLayer[CITY_Y1][GATE_X_MIN] = 0;                 // 南门第一格
  objectLayer[CITY_Y1][GATE_X_MAX] = 0;                 // 南门第二格

  // 3. 城内四座建筑
  for (const b of BUILDINGS) {
    fillRect(objectLayer, b.x, b.y, b.w, b.h, TILE.BUILDING);
  }

  // 4. 中心 PORTAL（传送员站位）
  const center = { x: 30, y: 30 };

  // 5. NPC 位置（建筑南侧门口的 COBBLE 上）
  const npcs = [
    { id: 'npc_weapon', x: 13, y: 16, name: '武器店老板', type: 'shop' },
    { id: 'npc_cloth', x: 45, y: 16, name: '服装店老板', type: 'shop' },
    { id: 'npc_potion', x: 13, y: 44, name: '药店老板', type: 'shop' },
    { id: 'npc_smith', x: 45, y: 44, name: '铁匠', type: 'shop' },
    { id: 'npc_teleporter', x: center.x, y: center.y, name: '传送员', type: 'teleporter' },
  ];

  // 6. 传送点
  const teleports = [
    { x: GATE_X_MIN, y: CITY_Y1, targetMap: 'mengzhong', targetX: 40, targetY: 5, label: '前往盟重省' },
    { x: GATE_X_MIN, y: CITY_Y0, targetMap: 'woma', targetX: 20, targetY: 4, label: '前往沃玛寺庙' },
  ];

  // 7. 玩家起点（城中央南侧，避开传送员）
  const playerStart = { x: 30, y: 33 };

  // 组装 mapData
  const mapData = {
    id: 'bicicheng',
    name: '比奇城',
    width: W,
    height: H,
    groundLayer,
    objectLayer,
    walkable: base.walkable,
    safeZone: [
      [CITY_X0, CITY_Y0],
      [CITY_X1, CITY_Y0],
      [CITY_X1, CITY_Y1],
      [CITY_X0, CITY_Y1],
    ],
    spawns: [],
    npcs,
    teleports,
    playerStart,
  };

  // 8. 确保关键点可行走（先清物体层，再放置装饰）
  ensureWalkable(mapData, playerStart.x, playerStart.y, TILE.COBBLE);
  for (const t of teleports) ensureWalkable(mapData, t.x, t.y, TILE.COBBLE);
  for (const n of npcs) ensureWalkable(mapData, n.x, n.y, TILE.COBBLE);

  // 9. 放置 PORTAL 视觉（中央传送员位 + 两处城门传送）
  setObject(mapData, center.x, center.y, TILE.PORTAL);
  for (const t of teleports) setObject(mapData, t.x, t.y, TILE.PORTAL);

  // 10. 放置 NPC_BASE 底座（传送员站在 PORTAL 上，不再叠加 NPC_BASE）
  for (const n of npcs) {
    if (n.type === 'teleporter') continue;
    setObject(mapData, n.x, n.y, TILE.NPC_BASE);
  }

  // 11. 重算通行性
  setWalkableFromLayers(mapData);

  return mapData;
}

export const BICICHENG_MAP = createBicichengMap();

export default BICICHENG_MAP;
