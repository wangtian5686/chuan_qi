/**
 * Projectile.js — 投射物（火球术 / 灵魂火符 / 弓箭手射击 / 祖玛雕像远程）
 *
 * 职责：
 * - 沿直线追踪目标实体飞行（speed 瓦片 / 秒）
 * - 接近目标 < 0.3 瓦片时命中，触发 onHit 回调（由 SkillSystem 注入伤害结算）
 * - 目标中途死亡：沿原方向继续飞行 0.5 秒后销毁
 * - 飞行超 3 秒自动销毁
 *
 * 约定：
 * - 符合 Scene 实体鸭子类型接口（update / getRenderInfo / getSprite）
 * - 由 SkillSystem 通过 scene.addEntity('projectile', this) 添加，Scene 自动驱动 update 与清理
 * - 命中伤害结算（命中 / 闪避 / 暴击 / 不死系加成）在 onHit 内由 SkillSystem 完成
 * - 世界坐标 (wx,wy) 由瓦片坐标按等距公式换算（TILE_W=64 / TILE_H=32）
 */

import { computeDamage } from '../data/skills.js';
import { angleBetween } from '../utils/math.js';

const TILE_W = 64;
const TILE_H = 32;

function tileToWorld(tx, ty) {
  return {
    wx: (tx - ty) * (TILE_W / 2),
    wy: (tx + ty) * (TILE_H / 2),
  };
}

/** 技能 -> 投射物外观 */
const SKILL_VISUAL = {
  fireball:  { color: '#ff6600', size: 0.45 },
  soul_fire: { color: '#aaff66', size: 0.40 },
};
const DEFAULT_VISUAL = { color: '#ffffff', size: 0.40 };

/** 全局自增 id 计数器 */
let _nextProjectileId = 1;

export class Projectile {
  /**
   * @param {object} owner 施法者（玩家或怪物）
   * @param {object|null} targetEntity 目标实体引用（可能为空，表示朝目标点射击）
   * @param {object} skill 技能定义
   * @param {number} skillLevel 技能等级
   * @param {number} [tx] 起点瓦片 X（缺省取 owner.tx）
   * @param {number} [ty] 起点瓦片 Y
   */
  constructor(owner, targetEntity, skill, skillLevel, tx, ty) {
    /** 唯一 id */
    this.id = _nextProjectileId++;
    this.ownerId = owner ? owner.id : null;
    this.ownerType = owner && owner.classId ? 'player' : 'monster';
    this.skill = skill;
    this.skillLevel = skillLevel;

    // 起点
    this.tx = tx != null ? tx : (owner ? owner.tx : 0);
    this.ty = ty != null ? ty : (owner ? owner.ty : 0);
    const w = tileToWorld(this.tx, this.ty);
    this.wx = w.wx;
    this.wy = w.wy;
    this.worldX = this.wx;
    this.worldY = this.wy;

    // 目标
    this.targetEntity = targetEntity || null;
    this.targetTx = targetEntity ? targetEntity.tx : this.tx;
    this.targetTy = targetEntity ? targetEntity.ty : this.ty;
    /** 构造时是否持有目标（用于区分"目标中途死亡"与"朝点射击"两种情形） */
    this.everHadTarget = !!targetEntity;

    // 运动参数
    this.speed = (skill && skill.projectileSpeed) || 8; // 瓦片 / 秒
    /** 当前飞行方向单位向量（瓦片空间） */
    this.dir = { x: 0, y: 0 };
    /** 飞行时长（秒），>3 自动销毁 */
    this.age = 0;
    /** 目标丢失后的剩余直飞时间（秒），仅 everHadTarget 情形使用 */
    this.loseTimer = null;

    // 伤害区间（computeDamage 计算，含 coefficient 倍率；不死系加成在 onHit 内追加）
    this.damage = this._computeDamage(owner, skill, skillLevel);
    this.damageType = skill ? skill.damageType : 'magic';

    this.alive = true;
    this.dead = false;

    const visual = (skill && SKILL_VISUAL[skill.id]) || DEFAULT_VISUAL;
    this.color = visual.color;
    this.size = visual.size;

    /**
     * 命中回调：(target, projectile, scene) => void，由 SkillSystem 注入
     * @type {Function|null}
     */
    this.onHit = null;

    // 初始化方向
    this._updateDir();
  }

  /** 计算技能基础伤害区间 */
  _computeDamage(owner, skill, skillLevel) {
    if (!skill || !owner) return null;
    const s = owner.stats || {};
    const casterView = {
      skillLevel,
      minAtk: s.minAtk != null ? s.minAtk : (owner.minAtk || 0),
      maxAtk: s.maxAtk != null ? s.maxAtk : (owner.maxAtk || 0),
      minMatk: s.minMatk != null ? s.minMatk : (owner.minMatk || 0),
      maxMatk: s.maxMatk != null ? s.maxMatk : (owner.maxMatk || 0),
    };
    return computeDamage(skill, casterView, this.targetEntity);
  }

  /** 目标是否已死亡 / 失效 */
  _isTargetDead() {
    const t = this.targetEntity;
    if (!t) return true;
    if (t.state === 'dead' || t.dead === true || t.alive === false) return true;
    if (t.hp != null && t.hp <= 0) return true;
    if (t.stats && t.stats.hp != null && t.stats.hp <= 0) return true;
    return false;
  }

  /** 根据当前目标刷新飞行方向 */
  _updateDir() {
    const ttx = this.targetEntity ? this.targetEntity.tx : this.targetTx;
    const tty = this.targetEntity ? this.targetEntity.ty : this.targetTy;
    const dx = ttx - this.tx;
    const dy = tty - this.ty;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > 0.0001) {
      this.dir = { x: dx / d, y: dy / d };
    }
  }

  /** 同步世界坐标 */
  _syncWorld() {
    const w = tileToWorld(this.tx, this.ty);
    this.wx = w.wx;
    this.wy = w.wy;
    this.worldX = this.wx;
    this.worldY = this.wy;
  }

  /** 销毁 */
  _destroy() {
    this.alive = false;
    this.dead = true;
  }

  /**
   * 每帧更新
   * Scene 以 (dt, input, game, scene) 调用，这里取第 4 个参数为 scene
   * @param {number} dt 帧间隔（秒）
   * @param {*} _input 输入（未使用）
   * @param {*} _game 游戏上下文（未使用）
   * @param {object} [_scene] Scene 实例
   */
  update(dt, _input, _game, _scene) {
    if (!this.alive) return;

    this.age += dt;
    if (this.age > 3) {
      this._destroy();
      return;
    }

    const step = this.speed * dt;

    if (this.targetEntity && !this._isTargetDead()) {
      // 追踪飞行
      const ttx = this.targetEntity.tx;
      const tty = this.targetEntity.ty;
      const dx = ttx - this.tx;
      const dy = tty - this.ty;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 0.3) {
        // 命中
        if (typeof this.onHit === 'function') {
          this.onHit(this.targetEntity, this, _scene);
        }
        this._destroy();
        return;
      }

      this.dir = { x: dx / dist, y: dy / dist };
      this.tx += this.dir.x * step;
      this.ty += this.dir.y * step;
      this._syncWorld();
      return;
    }

    // 目标已失效
    if (this.everHadTarget) {
      // 目标中途死亡：沿原方向继续飞行 0.5 秒后销毁
      if (this.loseTimer == null) this.loseTimer = 0.5;
      this.loseTimer -= dt;
      this.tx += this.dir.x * step;
      this.ty += this.dir.y * step;
      this._syncWorld();
      if (this.loseTimer <= 0) this._destroy();
    } else {
      // 朝目标点射击：飞向 (targetTx,targetTy)，到达后销毁
      const dx = this.targetTx - this.tx;
      const dy = this.targetTy - this.ty;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.3) {
        if (typeof this.onHit === 'function') this.onHit(null, this, _scene);
        this._destroy();
        return;
      }
      this.dir = { x: dx / dist, y: dy / dist };
      this.tx += this.dir.x * step;
      this.ty += this.dir.y * step;
      this._syncWorld();
    }
  }

  /**
   * 渲染信息
   * @returns {{worldX:number, worldY:number, color:string, size:number, alive:boolean}}
   */
  getRenderInfo() {
    return {
      worldX: this.wx,
      worldY: this.wy,
      color: this.color,
      size: this.size,
      alive: this.alive,
    };
  }

  /** 精灵描述（无图，返回 null 走 Scene 默认绘制路径） */
  getSprite() {
    return null;
  }

  /** 朝向角（弧度），便于渲染层旋转精灵 */
  getAngle() {
    return angleBetween(0, 0, this.dir.x, this.dir.y);
  }
}

export default Projectile;
