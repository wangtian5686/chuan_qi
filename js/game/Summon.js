/**
 * Summon.js — 召唤物（骷髅 / 神兽）
 *
 * 职责：
 * - 由道士召唤术生成，协助玩家战斗
 * - 简易 AI：在玩家附近 8 格内寻找敌对怪物并攻击；无目标时跟随玩家
 * - 受伤 / 死亡 / 持续时间到期自动消失
 *
 * 约定：
 * - 符合 Scene 实体鸭子类型接口（update / getRenderInfo / getSprite）
 * - 由 SkillSystem 通过 scene.addEntity('summon', this) 添加，Scene 自动驱动 update 与清理
 * - 攻击伤害直接调用 target.takeDamage（命中 / 暴击等最终结算留待 CombatSystem 接管后细化）
 * - 世界坐标 (wx,wy) 由瓦片坐标按等距公式换算（TILE_W=64 / TILE_H=32）
 */

import { distance, randInt } from '../utils/math.js';
import { SpriteRenderer } from '../engine/SpriteRenderer.js';

const TILE_W = 64;
const TILE_H = 32;

function tileToWorld(tx, ty) {
  return {
    wx: (tx - ty) * (TILE_W / 2),
    wy: (tx + ty) * (TILE_H / 2),
  };
}

/** 召唤物基础属性表 */
const SUMMON_DEFS = {
  skeleton: {
    name: '骷髅',
    maxHp: 100,
    minAtk: 8,
    maxAtk: 15,
    def: 4,
    moveSpeed: 3,
    attackRange: 1,
    attackSpeed: 1.0,
    visionRange: 6,
    durationMs: 60000,
    color: '#dcdcdc',
    size: 1.0,
  },
  beast: {
    name: '神兽',
    maxHp: 300,
    minAtk: 20,
    maxAtk: 35,
    def: 10,
    moveSpeed: 4,
    attackRange: 1,
    attackSpeed: 1.2,
    visionRange: 7,
    durationMs: 60000,
    color: '#d4a020',
    size: 1.3,
  },
};

/** 全局自增 id 计数器 */
let _nextSummonId = 1;

export class Summon {
  /**
   * @param {object} owner 召唤者（玩家 Player 实例）
   * @param {string} summonId 'skeleton' | 'beast'
   * @param {number} tx 出生瓦片 X
   * @param {number} ty 出生瓦片 Y
   * @param {object} map 地图实例（保留供后续寻路扩展使用）
   */
  constructor(owner, summonId, tx, ty, map) {
    /** 唯一 id */
    this.id = _nextSummonId++;
    this.ownerId = owner ? owner.id : null;
    this.owner = owner || null;
    this.summonId = summonId;

    const def = SUMMON_DEFS[summonId] || SUMMON_DEFS.skeleton;
    this.name = def.name;
    /** 召唤物等级随召唤者（便于后续伤害 / 经验结算） */
    this.level = owner ? owner.level || 1 : 1;

    this.stats = {
      maxHp: def.maxHp,
      hp: def.maxHp,
      minAtk: def.minAtk,
      maxAtk: def.maxAtk,
      def: def.def,
      moveSpeed: def.moveSpeed,
      attackRange: def.attackRange,
      attackSpeed: def.attackSpeed,
      visionRange: def.visionRange,
    };

    this.tx = tx;
    this.ty = ty;
    const w = tileToWorld(tx, ty);
    this.wx = w.wx;
    this.wy = w.wy;
    this.worldX = this.wx;
    this.worldY = this.wy;
    this.facing = 0;
    this.map = map || null;

    /** 状态机：'idle' | 'moving' | 'attacking' | 'dead' */
    this.state = 'idle';
    /** 当前攻击目标（怪物引用） */
    this.target = null;
    /** 攻击冷却剩余毫秒 */
    this.attackCooldownMs = 0;

    this.alive = true;
    this.dead = false;
    /** 存在时长（毫秒），到期消失 */
    this.durationMs = def.durationMs;

    this.color = def.color;
    this.size = def.size;
  }

  /**
   * 在玩家附近 8 格内寻找最近敌对怪物
   * @param {object} scene Scene 实例
   * @returns {object|null}
   */
  _findTarget(scene) {
    if (!scene || !this.owner) return null;
    const ox = this.owner.tx;
    const oy = this.owner.ty;
    let best = null;
    let bestDist = Infinity;
    for (const m of scene.monsters || []) {
      if (!m || this._isDead(m)) continue;
      // 仅攻击玩家附近 8 格内的敌对怪
      if (distance(ox, oy, m.tx, m.ty) > 8) continue;
      const d = distance(this.tx, this.ty, m.tx, m.ty);
      if (d < bestDist) {
        bestDist = d;
        best = m;
      }
    }
    return best;
  }

  /** 单位是否已死亡 / 失效 */
  _isDead(e) {
    if (!e) return true;
    if (e.state === 'dead' || e.dead === true || e.alive === false) return true;
    if (e.hp != null && e.hp <= 0) return true;
    if (e.stats && e.stats.hp != null && e.stats.hp <= 0) return true;
    return false;
  }

  /** 朝目标方向移动一步 */
  _moveToward(targetTx, targetTy, speedTilesPerSec, dt) {
    const dx = targetTx - this.tx;
    const dy = targetTy - this.ty;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.001) return;
    const step = speedTilesPerSec * dt;
    if (step >= dist) {
      this.tx = targetTx;
      this.ty = targetTy;
    } else {
      this.tx += (dx / dist) * step;
      this.ty += (dy / dist) * step;
    }
    const w = tileToWorld(this.tx, this.ty);
    this.wx = w.wx;
    this.wy = w.wy;
    this.worldX = this.wx;
    this.worldY = this.wy;
    this.facing = this._dirToFacing(dx, dy);
  }

  /** 位移向量 -> 8 方向 facing（与 Player 一致：0=下 顺时针） */
  _dirToFacing(dx, dy) {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return this.facing;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    return (Math.round(a / (Math.PI / 4)) + 6) % 8;
  }

  /** 对目标造成一次普攻伤害 */
  _attack(target) {
    const amt = randInt(this.stats.minAtk, this.stats.maxAtk);
    if (target && typeof target.takeDamage === 'function') {
      target.takeDamage(amt, 'physical');
    }
    this.attackCooldownMs = 1000 / (this.stats.attackSpeed || 1);
  }

  /**
   * 受到伤害
   * @param {number} amount 伤害量
   * @param {string} [_type='physical'] 伤害类型
   */
  takeDamage(amount, _type = 'physical') {
    if (this.state === 'dead') return;
    const dmg = Math.max(0, amount - (this.stats.def || 0));
    this.stats.hp -= dmg;
    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
      this.alive = false;
      this.dead = true;
      this.state = 'dead';
      this.target = null;
    }
  }

  /**
   * 每帧更新：状态机 + 持续时间递减
   * Scene 以 (dt, input, game, scene) 调用
   * @param {number} dt 帧间隔（秒）
   * @param {*} _input 输入（未使用）
   * @param {object} _game 游戏上下文
   * @param {object} [scene] Scene 实例
   */
  update(dt, _input, _game, scene) {
    if (!this.alive) return;
    const sc = scene || (_game && _game.scene) || null;

    // 持续时间递减
    this.durationMs -= dt * 1000;
    if (this.durationMs <= 0) {
      this.durationMs = 0;
      this.alive = false;
      this.dead = true;
      this.state = 'dead';
      return;
    }

    // 召唤者已失效：原地待机
    if (!this.owner || this._isDead(this.owner)) {
      this.state = 'idle';
      return;
    }

    // 目标失效则重新选取
    if (!this.target || this._isDead(this.target)) {
      this.target = this._findTarget(sc);
    }

    if (this.target) {
      const dist = distance(this.tx, this.ty, this.target.tx, this.target.ty);
      if (dist <= this.stats.attackRange + 0.4) {
        // 进入攻击
        this.state = 'attacking';
        this.facing = this._dirToFacing(
          this.target.tx - this.tx,
          this.target.ty - this.ty
        );
        this.attackCooldownMs -= dt * 1000;
        if (this.attackCooldownMs <= 0) {
          this._attack(this.target);
        }
      } else {
        // 追击
        this.state = 'moving';
        this._moveToward(this.target.tx, this.target.ty, this.stats.moveSpeed, dt);
      }
    } else {
      // 无目标：跟随召唤者，保持 2 格内
      const distOwner = distance(this.tx, this.ty, this.owner.tx, this.owner.ty);
      if (distOwner > 2) {
        this.state = 'moving';
        this._moveToward(this.owner.tx, this.owner.ty, this.stats.moveSpeed, dt);
      } else {
        this.state = 'idle';
      }
    }
  }

  /**
   * 渲染信息（供 Scene 默认绘制：阴影 + 名字 + 血条）
   * @returns {{worldX:number, worldY:number, sprite:object, name:string, nameColor:string, hpRatio:number, level:number, color:string, size:number}}
   */
  getRenderInfo() {
    return {
      worldX: this.wx,
      worldY: this.wy,
      sprite: this.getSprite(),
      name: this.name,
      nameColor: '#ffe9a8',
      hpRatio: this.stats.maxHp > 0 ? this.stats.hp / this.stats.maxHp : 0,
      level: this.level,
      color: this.color,
      size: this.size,
      shadowRadius: 12,
    };
  }

  /**
   * 获取精灵描述
   * - 带 camera：返回 {sortY, draw}（供 Scene._wrapEntity）
   * - 不带 camera：返回 null（无图占位）
   * @param {object} [camera]
   */
  getSprite(camera) {
    if (camera !== undefined && camera !== null) {
      const self = this;
      return {
        sortY: this.wy,
        draw(ctx) {
          self._render(ctx, camera);
        },
      };
    }
    return null;
  }

  /** 实际绘制：阴影 + 色块占位 + 名字 + 血条 */
  _render(ctx, camera) {
    SpriteRenderer.drawShadow(ctx, camera, this.wx, this.wy, 12);
    const s = camera.worldToScreen(this.wx, this.wy);
    const bw = 22;
    const bh = 36;
    ctx.save();
    if (!this.alive || this.stats.hp <= 0) ctx.globalAlpha = 0.5;
    ctx.fillStyle = this.color || '#cccccc';
    ctx.fillRect(s.x - bw / 2, s.y - bh, bw, bh);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x - bw / 2, s.y - bh, bw, bh);
    ctx.restore();
    if (!this.alive || this.stats.hp <= 0) return;
    if (this.name) {
      SpriteRenderer.drawNameTag(ctx, camera, this.wx, this.wy, this.name, '#88ccff');
    }
    if (this.stats.maxHp > 0) {
      SpriteRenderer.drawHealthBar(ctx, camera, this.wx, this.wy, this.stats.hp / this.stats.maxHp);
    }
  }

  /** 序列化 */
  serialize() {
    return {
      id: this.id,
      ownerId: this.ownerId,
      summonId: this.summonId,
      name: this.name,
      level: this.level,
      stats: { ...this.stats },
      tx: this.tx,
      ty: this.ty,
      wx: this.wx,
      wy: this.wy,
      facing: this.facing,
      state: this.state,
      durationMs: this.durationMs,
      alive: this.alive,
    };
  }
}

export default Summon;
