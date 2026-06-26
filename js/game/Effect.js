/**
 * Effect.js — 视觉特效实体
 *
 * 职责：
 * - 表示施法 / 受击 / 升级 / 死亡爆裂 / AOE 范围 / buff 护盾 / 毒云等短时视觉特效
 * - 自驱衰减：remainingMs 递减，归零后 alive=false
 * - 提供渲染信息（progress / color / radius）供渲染层按类型绘制
 *
 * 约定：
 * - 符合 Scene 实体鸭子类型接口（update / getRenderInfo / getSprite）
 * - 当前 Scene 实体类型未含 'effect'，由 SkillSystem 自持集合并在 update(dt) 中驱动；
 *   后续若 Scene 扩展支持 effect 类型，可直接 scene.addEntity('effect', this) 复用。
 * - 世界坐标 (wx,wy) 由瓦片坐标按等距公式换算（TILE_W=64 / TILE_H=32）
 */

/** 等距瓦片像素尺寸（与 IsometricMap / Player 一致） */
const TILE_W = 64;
const TILE_H = 32;

/**
 * 瓦片坐标 -> 世界像素坐标（瓦片中心）
 * 与 Player.tileToWorld / IsometricMap.tileToWorld 公式一致。
 */
function tileToWorld(tx, ty) {
  return {
    wx: (tx - ty) * (TILE_W / 2),
    wy: (tx + ty) * (TILE_H / 2),
  };
}

/**
 * 各特效类型的默认参数：总时长 / 颜色 / 半径（瓦片单位）
 * 构造时 options 可覆盖。
 */
const EFFECT_PRESETS = {
  cast:        { durationMs: 300, color: '#ffdd88', radius: 0.8 },
  hit:         { durationMs: 250, color: '#ff5555', radius: 0.4 },
  levelup:     { durationMs: 800, color: '#ffdd44', radius: 1.5 },
  death:       { durationMs: 500, color: '#880000', radius: 1.2 },
  aoe_fire:    { durationMs: 400, color: '#ff6600', radius: 2.0 },
  aoe_ice:     { durationMs: 400, color: '#66ccff', radius: 2.0 },
  aoe_thunder: { durationMs: 300, color: '#ffff66', radius: 2.0 },
  buff_shield: { durationMs: 400, color: '#88aaff', radius: 1.0 },
  poison_cloud:{ durationMs: 600, color: '#99cc66', radius: 1.5 },
};

/** 全局自增 id 计数器 */
let _nextEffectId = 1;

export class VisualEffect {
  /**
   * @param {string} type 特效类型（见 EFFECT_PRESETS）
   * @param {number} tx 瓦片 X
   * @param {number} ty 瓦片 Y
   * @param {object} [options={}] 可选覆盖：durationMs / color / radius
   */
  constructor(type, tx, ty, options = {}) {
    /** 唯一 id */
    this.id = _nextEffectId++;
    this.type = type;
    this.tx = tx;
    this.ty = ty;
    const w = tileToWorld(tx, ty);
    this.wx = w.wx;
    this.wy = w.wy;
    /** 兼容 Scene 实体字段（worldX / worldY） */
    this.worldX = this.wx;
    this.worldY = this.wy;

    const preset = EFFECT_PRESETS[type] || EFFECT_PRESETS.cast;
    this.totalMs = options.durationMs != null ? options.durationMs : preset.durationMs;
    this.remainingMs = this.totalMs;
    this.color = options.color || preset.color;
    this.radius = options.radius != null ? options.radius : preset.radius;

    /** 是否存活（归零后置 false，由持有者清理） */
    this.alive = true;
    /** Scene 鸭子类型清理标记 */
    this.dead = false;
  }

  /**
   * 每帧更新：递减剩余时间，归零则失活
   * @param {number} dt 帧间隔（秒）
   */
  update(dt) {
    this.remainingMs -= dt * 1000;
    if (this.remainingMs <= 0) {
      this.remainingMs = 0;
      this.alive = false;
      this.dead = true;
    }
  }

  /**
   * 渲染信息
   * @returns {{worldX:number, worldY:number, type:string, progress:number, color:string, radius:number, alive:boolean}}
   */
  getRenderInfo() {
    return {
      worldX: this.wx,
      worldY: this.wy,
      type: this.type,
      progress: this.totalMs > 0 ? 1 - this.remainingMs / this.totalMs : 1,
      color: this.color,
      radius: this.radius,
      alive: this.alive,
    };
  }

  /**
   * 精灵描述（无自定义精灵图，返回 null 让 Scene 走默认绘制路径）
   * @returns {null}
   */
  getSprite() {
    return null;
  }
}

export default VisualEffect;
