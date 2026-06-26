/**
 * math.js — 通用数学工具函数
 * 提供 clamp/lerp/随机/距离/角度等常用运算，供引擎与游戏逻辑复用。
 */

/** 将 v 限制在 [min, max] 区间 */
export function clamp(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

/** 线性插值：a -> b，t 取 [0,1] */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 返回 [min, max] 闭区间内的随机整数 */
export function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 返回 [min, max) 区间内的随机浮点数 */
export function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

/** 两点欧氏距离 */
export function distance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

/** 两点曼哈顿距离（|dx| + |dy|），常用于网格启发式 */
export function manhattan(x1, y1, x2, y2) {
  return Math.abs(x2 - x1) + Math.abs(y2 - y1);
}

/** 从 (x1,y1) 指向 (x2,y2) 的弧度角，范围 [-PI, PI] */
export function angleBetween(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

/** 将弧度标准化到 [0, 2*PI) */
export function normalizeAngle(a) {
  let r = a % (Math.PI * 2);
  if (r < 0) r += Math.PI * 2;
  return r;
}

/** 角度差（带符号），结果在 [-PI, PI]，用于最短旋转方向判断 */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const TWO_PI = Math.PI * 2;
export { TWO_PI };
