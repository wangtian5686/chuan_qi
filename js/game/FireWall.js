/**
 * FireWall.js — 地面火墙（持续区域伤害）
 *
 * 职责：
 * - 在指定 3 个瓦片上放置火墙，持续 durationMs
 * - 每 1 秒对停留在火墙瓦片上的敌对单位造成一次魔法伤害（通过 onTick 回调结算）
 * - 提供每个瓦片的渲染信息
 *
 * 约定：
 * - 符合 Scene 实体鸭子类型接口（update / getRenderInfo / getSprite）
 * - 由 SkillSystem 自持集合并在 update(dt) 中驱动；onTick 由 SkillSystem 注入，
 *   内部调用 combat.applyDamage 进行伤害结算（命中 / 闪避 / 暴击由 CombatSystem 决定）
 * - 敌对单位判定：owner 为玩家则伤怪物，owner 为怪物则伤玩家
 */

const TILE_W = 64;
const TILE_H = 32;

function tileToWorld(tx, ty) {
  return {
    wx: (tx - ty) * (TILE_W / 2),
    wy: (tx + ty) * (TILE_H / 2),
  };
}

/** 全局自增 id 计数器 */
let _nextFireWallId = 1;

export class FireWall {
  /**
   * @param {Array<{tx:number,ty:number}>} tiles 火墙覆盖的瓦片（通常 3 格长条）
   * @param {number} durationMs 持续时间（毫秒）
   * @param {number|{min:number,max:number}} damagePerTick 每秒伤害（数值或区间）
   * @param {object} owner 施法者（用于判定敌对单位与伤害归属）
   */
  constructor(tiles, durationMs, damagePerTick, owner) {
    /** 唯一 id */
    this.id = _nextFireWallId++;
    /** 瓦片列表（带预计算世界坐标） */
    this.tiles = (tiles || []).map((t) => {
      const w = tileToWorld(t.tx, t.ty);
      return { tx: t.tx, ty: t.ty, wx: w.wx, wy: w.wy };
    });
    this.remainingMs = durationMs;
    this.damagePerTick = damagePerTick;
    this.ownerId = owner ? owner.id : null;
    this.ownerType = owner && owner.classId ? 'player' : 'monster';
    this.tickMs = 1000;
    /** 距离上次结算的累计毫秒 */
    this.tickAccumulator = 0;

    this.alive = true;
    this.dead = false;

    /**
     * 命中回调：(target) => void，由 SkillSystem 注入，
     * 内部对 target 调用 combat.applyDamage 并生成飘字 / 受击特效。
     * @type {Function|null}
     */
    this.onTick = null;
  }

  /**
   * 判定本火墙应攻击的目标集合
   * - ownerType='player'：场景中的怪物
   * - ownerType='monster'：玩家
   * @param {object} scene Scene 实例
   * @returns {Array<object>}
   */
  _getTargets(scene) {
    if (!scene) return [];
    if (this.ownerType === 'player') {
      return (scene.monsters || []).filter((m) => m && !this._isDead(m));
    }
    return scene.player && !this._isDead(scene.player) ? [scene.player] : [];
  }

  /** 单位是否已死亡 / 失效 */
  _isDead(e) {
    if (!e) return true;
    if (e.state === 'dead' || e.dead === true || e.alive === false) return true;
    if (e.hp != null && e.hp <= 0) return true;
    if (e.stats && e.stats.hp != null && e.stats.hp <= 0) return true;
    return false;
  }

  /**
   * 每帧更新：递减持续时间，累计 tick，每 1 秒结算一次伤害
   * @param {number} dt 帧间隔（秒）
   * @param {object} scene Scene 实例
   */
  update(dt, scene) {
    this.remainingMs -= dt * 1000;
    this.tickAccumulator += dt * 1000;

    // 每 tickMs 结算一次（可能在一帧内结算多次以补偿大 dt）
    while (this.tickAccumulator >= this.tickMs && this.remainingMs > 0) {
      this.tickAccumulator -= this.tickMs;
      this._doTick(scene);
    }

    if (this.remainingMs <= 0) {
      this.remainingMs = 0;
      this.alive = false;
      this.dead = true;
    }
  }

  /** 单次 tick 结算：对站在火墙瓦片上的敌对单位造成伤害 */
  _doTick(scene) {
    if (!this.onTick) return;
    const targets = this._getTargets(scene);
    for (const t of targets) {
      if (!t || t.tx == null || t.ty == null) continue;
      const onFire = this.tiles.some(
        (tile) => Math.abs(tile.tx - t.tx) < 0.6 && Math.abs(tile.ty - t.ty) < 0.6
      );
      if (onFire) this.onTick(t);
    }
  }

  /**
   * 渲染信息：每个瓦片的渲染描述 + 整体进度
   * @returns {{tiles:Array<{tx:number,ty:number,worldX:number,worldY:number}>, progress:number, alive:boolean}}
   */
  getRenderInfo() {
    return {
      tiles: this.tiles.map((t) => ({ tx: t.tx, ty: t.ty, worldX: t.wx, worldY: t.wy })),
      progress: 1, // 持续期间一直渲染，由渲染层按 remainingMs 做闪烁
      remainingMs: this.remainingMs,
      alive: this.alive,
    };
  }

  /** 无自定义精灵图 */
  getSprite() {
    return null;
  }
}

export default FireWall;
