/**
 * test.js — 测试地图（20×20 等距）
 *
 * 用于本任务（Task 2 渲染引擎）的自测验证：
 * - 地面整体为 GRASS，边缘一圈为 STONE
 * - 中央放置若干 TREE 与 ROCK 作为遮挡物
 * - 一个 PORTAL 传送点（位于右上区域）
 * - 安全区多边形覆盖中央 6×6 区域
 * - playerStart 位于地图正中央
 *
 * 坐标系：tx 为列（x 方向），ty 为行（y 方向），均从 0 开始。
 * 物体层中 0 表示空。
 */

import { TILE, isTileWalkable } from '../tiles.js';

const W = 20;
const H = 20;

// 构建地面层：默认 GRASS，边缘一圈 STONE
const groundLayer = [];
for (let y = 0; y < H; y++) {
  const row = [];
  for (let x = 0; x < W; x++) {
    const isEdge = x === 0 || y === 0 || x === W - 1 || y === H - 1;
    row.push(isEdge ? TILE.STONE : TILE.GRASS);
  }
  groundLayer.push(row);
}

// 构建物体层：默认空，散布 TREE / ROCK / PORTAL
const objectLayer = [];
for (let y = 0; y < H; y++) {
  objectLayer.push(new Array(W).fill(0));
}

// 中央 6×6 安全区范围：x∈[7,12], y∈[7,12]（不含物体，确保安全区内可行走）
// 在安全区外围放置一些装饰物
const treePositions = [
  [3, 3], [4, 5], [6, 3], [3, 6],
  [14, 3], [16, 4], [15, 6], [13, 5],
  [3, 14], [5, 16], [4, 13], [6, 15],
  [14, 14], [16, 15], [13, 16], [15, 13],
];
const rockPositions = [
  [8, 4], [11, 4], [4, 8], [4, 11],
  [15, 8], [15, 11], [8, 15], [11, 15],
];
for (const [x, y] of treePositions) {
  objectLayer[y][x] = TILE.TREE;
}
for (const [x, y] of rockPositions) {
  objectLayer[y][x] = TILE.ROCK;
}

// 传送点位于右上角附近
const PORTAL_X = 17;
const PORTAL_Y = 2;
objectLayer[PORTAL_Y][PORTAL_X] = TILE.PORTAL;

// 构建可行走标记：综合 walkable 配置与物体层阻挡
// - 边缘 STONE 仍可走（仅视觉区分）
// - 物体层非空且 isTileWalkable 为 false 时不可走
const walkable = [];
for (let y = 0; y < H; y++) {
  const row = [];
  for (let x = 0; x < W; x++) {
    const obj = objectLayer[y][x];
    row.push(isTileWalkable(obj));
  }
  walkable.push(row);
}

// 安全区多边形（瓦片坐标）：覆盖中央 6×6 区域，顺时针给出顶点
const safeZone = [
  [7, 7], [12, 7], [12, 12], [7, 12],
];

// 玩家出生点：地图正中央
const playerStart = { x: 10, y: 10 };

export const TEST_MAP = {
  id: 'test',
  name: '测试地图',
  width: W,
  height: H,
  groundLayer,
  objectLayer,
  walkable,
  safeZone,
  spawns: [],
  npcs: [],
  teleports: [
    {
      x: PORTAL_X,
      y: PORTAL_Y,
      targetMap: 'test',
      targetX: playerStart.x,
      targetY: playerStart.y,
    },
  ],
  playerStart,
};

export default TEST_MAP;
