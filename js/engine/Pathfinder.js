/**
 * Pathfinder.js — A* 寻路与路径简化
 *
 * 实现：
 * - 8 方向移动（含对角线）
 * - 对角线穿越需检查两侧邻格是否均可走，避免"穿墙角"
 * - Manhattan 距离启发式（网格寻路常用，且对 8 方向仍可采纳）
 * - 使用二叉堆（小顶堆）作为开放表以提升大图性能
 *
 * 路径返回瓦片坐标数组 [{tx,ty},...]，起点与终点均包含；
 * 找不到路径返回 null。
 */

export class Pathfinder {
  /**
   * A* 寻路
   * @param {import('./IsometricMap.js').IsometricMap} map 地图实例（提供 isWalkable / inBounds）
   * @param {{tx:number, ty:number}} startTile 起点
   * @param {{tx:number, ty:number}} endTile 终点
   * @returns {Array<{tx:number, ty:number}>|null}
   */
  static findPath(map, startTile, endTile) {
    const startTx = Math.round(startTile.tx);
    const startTy = Math.round(startTile.ty);
    const endTx = Math.round(endTile.tx);
    const endTy = Math.round(endTile.ty);

    // 起点或终点越界 / 不可走：直接失败
    if (!map.inBounds(startTx, startTy) || !map.inBounds(endTx, endTy)) {
      return null;
    }
    // 终点不可走时，尝试在终点周围找最近可走格（避免点击树木等导致寻路失败）
    let goalTx = endTx, goalTy = endTy;
    if (!map.isWalkable(endTx, endTy)) {
      const alt = Pathfinder._nearestWalkable(map, endTx, endTy);
      if (!alt) return null;
      goalTx = alt.tx;
      goalTy = alt.ty;
    }
    // 起点不可走（理论上玩家不该在此），退化为终点
    if (!map.isWalkable(startTx, startTy)) {
      return [{ tx: goalTx, ty: goalTy }];
    }

    // 起点等于终点
    if (startTx === goalTx && startTy === goalTy) {
      return [{ tx: startTx, ty: startTy }];
    }

    // 8 方向偏移：[dx, dy, cost]（对角线 cost ≈ √2）
    const SQRT2 = Math.SQRT2;
    const DIRS = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
    ];

    // 节点 key 编码：ty * W + tx（W 取地图宽度上限避免冲突）
    // 这里用字符串 key 简单稳妥
    const key = (tx, ty) => tx + ',' + ty;

    const open = new MinHeap();
    const gScore = new Map(); // key -> g
    const cameFrom = new Map(); // key -> prevKey
    const closed = new Set();

    const startKey = key(startTx, startTy);
    gScore.set(startKey, 0);
    open.push({
      tx: startTx,
      ty: startTy,
      f: Pathfinder._heuristic(startTx, startTy, goalTx, goalTy),
    });

    // 上限：避免极端情况死循环
    const maxIter = map.width * map.height * 4;
    let iter = 0;

    while (open.size() > 0 && iter < maxIter) {
      iter++;
      const cur = open.pop();
      const curKey = key(cur.tx, cur.ty);
      if (closed.has(curKey)) continue;
      closed.add(curKey);

      // 到达终点
      if (cur.tx === goalTx && cur.ty === goalTy) {
        return Pathfinder._reconstruct(cameFrom, curKey, startKey);
      }

      const curG = gScore.get(curKey);

      for (const [dx, dy, cost] of DIRS) {
        const nx = cur.tx + dx;
        const ny = cur.ty + dy;
        if (!map.inBounds(nx, ny)) continue;
        if (!map.isWalkable(nx, ny)) continue;

        // 对角线穿越检查：两侧邻格必须都可走，否则禁止穿角
        if (dx !== 0 && dy !== 0) {
          if (!map.isWalkable(cur.tx + dx, cur.ty) ||
              !map.isWalkable(cur.tx, cur.ty + dy)) {
            continue;
          }
        }

        const nKey = key(nx, ny);
        if (closed.has(nKey)) continue;

        const tentativeG = curG + cost;
        const prevG = gScore.get(nKey);
        if (prevG === undefined || tentativeG < prevG) {
          gScore.set(nKey, tentativeG);
          cameFrom.set(nKey, curKey);
          const f = tentativeG + Pathfinder._heuristic(nx, ny, goalTx, goalTy);
          open.push({ tx: nx, ty: ny, f });
        }
      }
    }

    return null; // 未找到路径
  }

  /** Manhattan 距离启发式 */
  static _heuristic(x1, y1, x2, y2) {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
  }

  /** 由 cameFrom 反推路径（从起点到终点） */
  static _reconstruct(cameFrom, endKey, startKey) {
    const path = [];
    let k = endKey;
    while (k !== undefined) {
      const [tx, ty] = k.split(',').map(Number);
      path.push({ tx, ty });
      if (k === startKey) break;
      k = cameFrom.get(k);
    }
    path.reverse();
    return path;
  }

  /**
   * 在 (tx,ty) 周围螺旋搜索最近的可走格（用于终点不可走时的回退）
   * @returns {{tx:number,ty:number}|null}
   */
  static _nearestWalkable(map, tx, ty) {
    const maxR = 6;
    for (let r = 1; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // 只看当前环
          const nx = tx + dx;
          const ny = ty + dy;
          if (map.inBounds(nx, ny) && map.isWalkable(nx, ny)) {
            return { tx: nx, ty: ny };
          }
        }
      }
    }
    return null;
  }

  /**
   * 路径简化：合并同方向线段（道格拉斯- Peucker 的简化版）
   * 保留方向改变的拐点，剔除共线中间点。
   * @param {Array<{tx:number,ty:number}>} path
   * @returns {Array<{tx:number,ty:number}>} 简化后的路径
   */
  static simplifyPath(path) {
    if (!path || path.length <= 2) return path ? path.slice() : [];

    const result = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const a = path[i - 1];
      const b = path[i];
      const c = path[i + 1];
      // 计算前后两段方向向量
      const d1x = b.tx - a.tx;
      const d1y = b.ty - a.ty;
      const d2x = c.tx - b.tx;
      const d2y = c.ty - b.ty;
      // 方向不同则保留 b
      if (d1x !== d2x || d1y !== d2y) {
        result.push(b);
      }
    }
    result.push(path[path.length - 1]);
    return result;
  }
}

/**
 * 极简二叉小顶堆（按 f 排序）
 * 用于 A* 开放表，提升大图寻路性能。
 */
class MinHeap {
  constructor() {
    this._a = [];
  }
  size() {
    return this._a.length;
  }
  push(node) {
    const a = this._a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this._a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < n && a[l].f < a[smallest].f) smallest = l;
        if (r < n && a[r].f < a[smallest].f) smallest = r;
        if (smallest === i) break;
        [a[smallest], a[i]] = [a[i], a[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

export default Pathfinder;
