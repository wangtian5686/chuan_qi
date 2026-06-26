/**
 * Pickup.js — 掉落物自动拾取系统
 *
 * 职责：
 * - 每帧扫描 scene.drops，玩家进入拾取范围（默认 0.5 瓦片）自动拾取
 * - 金币（itemId='gold'）：直接累加 player.gold
 * - 物品：调用 player.inventory.addItem，背包满则保留掉落物
 * - 拾取成功后标记 drop.dead=true，由 Scene._cleanupDead 统一移除
 * - 拾取后触发 game.onPickup(item, count) 回调（UI 提示 / 任务统计等）
 *
 * 复用：
 * - DropItem 的 canPickup(playerId) 做 owner 绑定校验
 * - items.js 的 getItem 取物品定义
 * - Inventory.addItem 加入背包
 *
 * 与 Scene 的协作：
 * - Scene._updateDrops 检测 drop.onPickup；DropItem 未实现 onPickup，
 *   故本系统作为独立拾取通路扫描 scene.drops。
 * - 若 drop 已被注入 onPickup（其它系统接管），本系统跳过，避免重复处理。
 *
 * 坐标约定：
 * - 拾取范围按世界像素距离判定，0.5 瓦片 ≈ 0.5 × sqrt(64²+32²) ≈ 35.8 像素
 */

import { getItem } from '../data/items.js';

/** 等距瓦片像素尺寸（与 IsometricMap / Player 一致） */
const TILE_W = 64;
const TILE_H = 32;
/** 瓦片对角线长度（像素），作为 1 瓦片距离单位 */
const TILE_DIAGONAL = Math.sqrt(TILE_W * TILE_W + TILE_H * TILE_H);

export class Pickup {
  /**
   * @param {object} scene Scene 实例
   * @param {object} [options]
   * @param {number} [options.rangeTiles=0.5] 自动拾取范围（瓦片）
   */
  constructor(scene, options = {}) {
    this.scene = scene;
    /** 自动拾取范围（瓦片） */
    this.rangeTiles = options.rangeTiles != null ? options.rangeTiles : 0.5;
  }

  /**
   * 每帧拾取检查
   * @param {number} dt 帧间隔（秒，保留参数便于扩展）
   * @param {object} [game] 游戏上下文（提供 onPickup 回调）
   */
  update(dt, game) {
    const scene = this.scene;
    if (!scene) return;
    const player = scene.player;
    if (!player) return;
    // 玩家死亡不拾取
    if (player.state === 'dead') return;

    const drops = scene.drops;
    if (!drops || drops.length === 0) return;

    const rangePx = this.rangeTiles * TILE_DIAGONAL;
    const r2 = rangePx * rangePx;
    const px = player.wx != null ? player.wx : 0;
    const py = player.wy != null ? player.wy : 0;

    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      if (!d || d.dead) continue;
      // 已被其它系统注入 onPickup 则交由 Scene 原生通路处理
      if (typeof d.onPickup === 'function') continue;
      // owner 绑定校验
      if (typeof d.canPickup === 'function' && !d.canPickup(player.id)) continue;

      const dx = (d.wx != null ? d.wx : d.tx) - px;
      const dy = (d.wy != null ? d.wy : d.ty) - py;
      if (dx * dx + dy * dy > r2) continue;

      const ok = this._pickup(player, d, game);
      if (ok) d.dead = true; // 标记由 Scene._cleanupDead 移除
    }
  }

  /**
   * 执行拾取
   * @param {object} player
   * @param {object} drop DropItem 实例
   * @param {object} [game]
   * @returns {boolean} 是否拾取成功（失败则保留掉落物）
   */
  _pickup(player, drop, game) {
    if (drop.itemId === 'gold') {
      // 金币：直接累加，无背包限制
      const amount = drop.count || 0;
      player.gold = (player.gold || 0) + amount;
      this._notify(game, { id: 'gold', name: '金币', type: 'gold' }, amount);
      return true;
    }

    const def = getItem(drop.itemId);
    if (!def) return false; // 未知物品，保留（避免丢失）

    // 加入背包；背包满返回 0，保留掉落物
    const added = player.inventory.addItem(drop.itemId, drop.count, drop.durability);
    if (added <= 0) return false;

    this._notify(game, def, added);
    return true;
  }

  /** 触发 game.onPickup 回调 */
  _notify(game, item, count) {
    if (game && typeof game.onPickup === 'function') {
      try {
        game.onPickup(item, count);
      } catch (_) {
        // 回调异常不影响拾取流程
      }
    }
  }
}

export default Pickup;
