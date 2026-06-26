/**
 * DamageText.js — 伤害 / 治疗飘字
 *
 * 职责：
 * - 在目标头顶生成向上漂浮的文字（伤害数字 / MISS / 暴击 / +治疗）
 * - 800ms 寿命，向上漂浮且速度递减（ease-out），alpha 随剩余时间衰减
 *
 * 约定：
 * - 符合 Scene 实体鸭子类型接口（update / getRenderInfo / getSprite）
 * - 由 SkillSystem 自持集合并在 update(dt) 中驱动
 * - 世界坐标 (wx,wy) 由瓦片坐标按等距公式换算（TILE_W=64 / TILE_H=32）
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
let _nextTextId = 1;

export class DamageText {
  /**
   * @param {number} tx 瓦片 X
   * @param {number} ty 瓦片 Y
   * @param {string} text 文本内容（如 "120" / "MISS" / "+80"）
   * @param {string} color 文本颜色
   * @param {object} [options={}] 可选：durationMs / crit / size / rise
   */
  constructor(tx, ty, text, color, options = {}) {
    /** 唯一 id */
    this.id = _nextTextId++;
    this.tx = tx;
    this.ty = ty;
    const w = tileToWorld(tx, ty);
    this.wx = w.wx;
    this.wy = w.wy;
    this.worldX = this.wx;
    this.worldY = this.wy;

    this.text = text;
    this.color = color || '#ffffff';
    /** 是否暴击（渲染层可放大字号） */
    this.crit = !!options.crit;
    this.size = options.size != null ? options.size : (this.crit ? 18 : 14);
    /** 最大上浮像素 */
    this.rise = options.rise != null ? options.rise : 30;

    this.totalMs = options.durationMs != null ? options.durationMs : 800;
    this.remainingMs = this.totalMs;
    /** 当前上浮偏移（像素，向上为负） */
    this.offsetY = 0;

    this.alive = true;
    this.dead = false;
  }

  /**
   * 每帧更新：递减剩余时间，更新上浮偏移（ease-out 递减）
   * @param {number} dt 帧间隔（秒）
   */
  update(dt) {
    this.remainingMs -= dt * 1000;
    if (this.remainingMs <= 0) {
      this.remainingMs = 0;
      this.alive = false;
      this.dead = true;
      this.offsetY = -this.rise;
      return;
    }
    // progress: 0 -> 1，用 (1-(1-p)^2) 做 ease-out，速度递减
    const p = 1 - this.remainingMs / this.totalMs;
    this.offsetY = -this.rise * (1 - (1 - p) * (1 - p));
  }

  /**
   * 渲染信息
   * @returns {{worldX:number, worldY:number, text:string, color:string, alpha:number, crit:boolean, size:number, alive:boolean}}
   */
  getRenderInfo() {
    return {
      worldX: this.wx,
      worldY: this.wy + this.offsetY,
      text: this.text,
      color: this.color,
      alpha: this.totalMs > 0 ? this.remainingMs / this.totalMs : 0,
      crit: this.crit,
      size: this.size,
      alive: this.alive,
    };
  }

  /** 无自定义精灵图，返回 null 让 Scene 走默认路径 */
  getSprite() {
    return null;
  }
}

export default DamageText;
