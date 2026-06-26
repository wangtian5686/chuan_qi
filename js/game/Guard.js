/**
 * Guard.js — 大刀卫士（守卫 NPC，Npc 的特化版本）
 *
 * 职责：
 * - 守卫城镇 / 安全区，主动追击并攻击红名玩家（pkValue > 7）
 * - 血量极厚（5000），攻击力高（200~400），普通玩家基本无法击杀
 * - 状态机：idle / chase / attack
 *
 * 复用：
 * - engine/Pathfinder 寻路（追击移动）
 * - engine/SpriteRenderer 渲染阴影 / 名字 / 血条
 * - CombatSystem.monsterAttack(this, target) 由 game.combat 调用结算普攻
 *
 * 集成约定：
 * - 由 PkSystem / Scene 通过 scene.npcs 持有，isGuard === true 供鸭子类型识别
 * - 攻击结算走 game.combat.monsterAttack（与怪物普攻同一通路），
 *   守卫 stats.minAtk/maxAtk 即攻击区间，一击对玩家造成大量伤害
 *
 * 坐标约定（与 Player / Monster / IsometricMap 一致）：
 * - 等距瓦片 64×32，瓦片中心世界坐标 wx=(tx-ty)*32, wy=(tx+ty)*16
 * - 移动速度 stats.moveSpeed 单位为"瓦片/秒"，按瓦片对角线长度换算为像素/秒
 */

import { Pathfinder } from '../engine/Pathfinder.js';
import { SpriteRenderer } from '../engine/SpriteRenderer.js';

/** 等距瓦片像素尺寸（与 IsometricMap / Player 一致） */
const TILE_W = 64;
const TILE_H = 32;
/** 瓦片对角线长度（像素），作为 1 瓦片距离单位，用于换算移动速度 */
const TILE_DIAGONAL = Math.sqrt(TILE_W * TILE_W + TILE_H * TILE_H);

/** 全局自增守卫 id 计数器 */
let _nextGuardId = 1;

/**
 * 瓦片坐标 -> 世界像素坐标（瓦片中心）
 * 与 IsometricMap.tileToWorld 公式一致。
 */
function tileToWorld(tx, ty) {
  return {
    wx: (tx - ty) * (TILE_W / 2),
    wy: (tx + ty) * (TILE_H / 2),
  };
}

/**
 * 由位移向量 (dx,dy) 计算 8 方向 facing（与 Player.dirToFacing 一致）
 * facing：0=下，1=左下，2=左，3=左上，4=上，5=右上，6=右，7=右下（顺时针）
 */
function dirToFacing(dx, dy) {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return 0;
  let a = Math.atan2(dy, dx);
  if (a < 0) a += Math.PI * 2;
  return (Math.round(a / (Math.PI / 4)) + 6) % 8;
}

export class Guard {
  /**
   * @param {object} config 配置：{ tx, ty, name? }
   * @param {object} map IsometricMap 实例（提供 isWalkable / tileToWorld，用于寻路）
   */
  constructor(config, map) {
    /** 唯一 id */
    this.id = _nextGuardId++;
    this.name = (config && config.name) || '大刀卫士';
    /** NPC 类型标记（守卫） */
    this.type = 'guard';
    /** 守卫标记，供 PkSystem / CombatSystem 鸭子类型识别 */
    this.isGuard = true;

    /** 地图引用（用于寻路） */
    this.map = map;
    /** 所属场景 / 游戏上下文（由 update 回写） */
    this.scene = null;
    this.game = null;

    // ===== 坐标 / 朝向 / 状态 =====
    this.tx = (config && config.tx) || 0;
    this.ty = (config && config.ty) || 0;
    const w = tileToWorld(this.tx, this.ty);
    this.wx = w.wx;
    this.wy = w.wy;
    /** 出生点 */
    this.spawnTx = this.tx;
    this.spawnTy = this.ty;
    /** 朝向：0=下 1=左下 2=左 3=左上 4=上 5=右上 6=右 7=右下 */
    this.facing = 0;

    /** 状态机：'idle' | 'chase' | 'attack' */
    this.state = 'idle';
    /** 当前目标（红名玩家） */
    this.target = null;
    /** 普攻冷却剩余毫秒 */
    this.attackCooldownMs = 0;
    /** 寻路路径（path[0] 为下一格目标瓦片） */
    this.path = [];
    /** 重新寻路计时器（秒） */
    this._repathTimer = 0;

    // ===== 属性 =====
    /** 守卫属性：血厚攻高，普通玩家难以击杀 */
    this.stats = {
      maxHp: 5000,
      hp: 5000,
      minAtk: 200,
      maxAtk: 400,
      def: 100,
      attackRange: 1,
      attackSpeed: 1.5,
      moveSpeed: 4,
      visionRange: 8,
    };

    /** 伤害类型（物理） */
    this.damageType = 'physical';
    /** 存活标记（守卫极难被击杀，保留以兼容战斗系统判定） */
    this.alive = true;
    this.dead = false;
  }

  // ===== 主更新 =====

  /**
   * 每帧更新：扫描红名玩家 -> 追击 -> 普攻
   * 兼容两种调用约定：
   *   1) update(dt, scene, game)        —— 规范直接调用
   *   2) update(dt, input, game, scene) —— Scene.update 统一驱动
   * @param {number} dt 帧间隔（秒）
   * @param {object} arg1 scene 或 input
   * @param {object} arg2 game
   * @param {object} arg3 scene（Scene.update 调用时）
   */
  update(dt, arg1, arg2, arg3) {
    // 解析 scene / game
    let scene = null;
    let game = null;
    if (arg3 && (arg3.npcs || arg3.monsters || arg3.map)) {
      scene = arg3;
      game = arg2;
    } else if (arg1 && (arg1.npcs || arg1.monsters || arg1.map)) {
      scene = arg1;
      game = arg2;
    } else {
      scene = this.scene;
      game = arg2;
    }
    if (scene) this.scene = scene;
    if (game) this.game = game;

    // 目标失效检测：死亡 / 脱离视野 / PK 值降回 <=7 -> 回到 idle
    if (this.target) {
      if (!this._isTargetValid(this.target)) {
        this.target = null;
        this.state = 'idle';
        this.path = [];
      }
    }

    switch (this.state) {
      case 'idle': {
        // 扫描视野内的红名玩家
        const p = this._scanRedPlayer(scene);
        if (p) {
          this.target = p;
          this.state = 'chase';
        }
        break;
      }

      case 'chase': {
        if (!this.target) {
          this.state = 'idle';
          break;
        }
        const dist = this._distToTarget();
        // 进入攻击范围 -> 攻击
        if (dist <= this.stats.attackRange) {
          this.state = 'attack';
          this.path = [];
          break;
        }
        // 朝玩家移动
        this._moveToward(this.target.tx, this.target.ty, dt);
        break;
      }

      case 'attack': {
        if (!this.target) {
          this.state = 'idle';
          break;
        }
        const dist = this._distToTarget();
        // 目标拉开距离 -> 重新追击
        if (dist > this.stats.attackRange + 0.5) {
          this.state = 'chase';
          break;
        }
        // 朝目标
        this._faceTarget();
        // 普攻冷却
        this.attackCooldownMs -= dt * 1000;
        if (this.attackCooldownMs <= 0) {
          const combat = (this.game && this.game.combat) || (this.scene && this.scene.combat);
          if (combat && typeof combat.monsterAttack === 'function') {
            combat.monsterAttack(this, this.target);
          }
          this.attackCooldownMs = 1000 / (this.stats.attackSpeed || 1);
        }
        break;
      }

      default:
        break;
    }
  }

  // ===== 受击 =====

  /**
   * 受到伤害：守卫血量极厚，玩家基本打不死
   * @param {number} amount 伤害量
   */
  takeDamage(amount) {
    const dmg = Math.max(0, amount);
    this.stats.hp -= dmg;
    if (this.stats.hp < 0) this.stats.hp = 0;
    // 守卫不会因玩家攻击死亡（血量 5000，普通玩家难以打穿）
  }

  // ===== 目标 / 移动辅助 =====

  /**
   * 目标是否仍可被守卫攻击
   * - 存活 + 红名（pkValue > 7）+ 在视野内
   * @param {object} t
   * @returns {boolean}
   */
  _isTargetValid(t) {
    if (!t) return false;
    if (t.state === 'dead') return false;
    if (t.stats && t.stats.hp <= 0) return false;
    if (!(t.pkValue > 7)) return false; // PK 值降回 <=7 -> 脱战
    const dist = this._distTo(t);
    if (dist > this.stats.visionRange) return false; // 脱离视野
    return true;
  }

  /**
   * 扫描视野内的红名玩家
   * @param {object} scene
   * @returns {object|null}
   */
  _scanRedPlayer(scene) {
    if (!scene) return null;
    const p = scene.player;
    if (!p || p.state === 'dead') return null;
    if (!(p.pkValue > 7)) return null; // 仅追击红名玩家
    const dist = this._distTo(p);
    if (dist > this.stats.visionRange) return null;
    return p;
  }

  /** 到当前目标的瓦片欧氏距离 */
  _distToTarget() {
    return this.target ? this._distTo(this.target) : Infinity;
  }

  /** 到指定实体的瓦片欧氏距离 */
  _distTo(t) {
    const dx = (t.tx != null ? t.tx : 0) - this.tx;
    const dy = (t.ty != null ? t.ty : 0) - this.ty;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 朝当前目标转向 */
  _faceTarget() {
    if (!this.target) return;
    const tw = tileToWorld(
      this.target.tx != null ? this.target.tx : this.tx,
      this.target.ty != null ? this.target.ty : this.ty,
    );
    this.facing = dirToFacing(tw.wx - this.wx, tw.wy - this.wy);
  }

  /**
   * 朝目标瓦片寻路并沿路径移动
   * - 路径为空或重寻路计时器到期时重算路径
   * @param {number} targetTx
   * @param {number} targetTy
   * @param {number} dt
   */
  _moveToward(targetTx, targetTy, dt) {
    this._repathTimer -= dt;
    const needRepath = this.path.length === 0 || this._repathTimer <= 0;
    if (needRepath) {
      const map = this.map;
      if (map && typeof Pathfinder.findPath === 'function') {
        const path = Pathfinder.findPath(
          map,
          { tx: this.tx, ty: this.ty },
          { tx: targetTx, ty: targetTy },
        );
        if (path && path.length > 0) {
          let simplified = Pathfinder.simplifyPath(path);
          if (
            simplified.length > 1 &&
            simplified[0].tx === this.tx &&
            simplified[0].ty === this.ty
          ) {
            simplified = simplified.slice(1);
          }
          this.path = simplified;
        }
      }
      this._repathTimer = 0.4;
    }
    this._followPath(dt);
  }

  /** 沿 this.path 前进一格（与 Player / Monster 移动逻辑一致） */
  _followPath(dt) {
    if (this.path.length === 0) return;
    const target = this.path[0];
    const tw = tileToWorld(target.tx, target.ty);
    const dx = tw.wx - this.wx;
    const dy = tw.wy - this.wy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // 速度：瓦片/秒 -> 像素/秒
    const speedPxPerSec = (this.stats.moveSpeed || 0) * TILE_DIAGONAL;
    const step = speedPxPerSec * dt;

    if (dist > 0.001) this.facing = dirToFacing(dx, dy);

    if (dist < 2 || step >= dist) {
      // 到达本格
      this.wx = tw.wx;
      this.wy = tw.wy;
      this.tx = target.tx;
      this.ty = target.ty;
      this.path.shift();
    } else {
      this.wx += (dx / dist) * step;
      this.wy += (dy / dist) * step;
    }
  }

  // ===== 渲染 =====

  /** 世界坐标 X（供 Scene.getEntitiesInRange / Y 排序使用） */
  get worldX() { return this.wx; }
  /** 世界坐标 Y */
  get worldY() { return this.wy; }

  /**
   * 获取渲染信息（供外部 Y 排序 / HUD 使用）
   * @returns {{worldX:number, worldY:number, sprite:{color:string}, name:string, nameColor:string}}
   */
  getRenderInfo() {
    return {
      worldX: this.wx,
      worldY: this.wy,
      sprite: { color: '#4169E1' },
      name: '大刀卫士',
      nameColor: '#00ff00',
    };
  }

  /**
   * 获取精灵描述（供 Scene.render 的 _wrapEntity 使用）
   * @param {object} camera
   * @returns {{sortY:number, draw:(ctx:CanvasRenderingContext2D)=>void}}
   */
  getSprite(camera) {
    const self = this;
    return {
      sortY: this.wy,
      draw(ctx) {
        self._render(ctx, camera);
      },
    };
  }

  /** 实际绘制：阴影 + 色块占位 + 名字 + 血条 */
  _render(ctx, camera) {
    SpriteRenderer.drawShadow(ctx, camera, this.wx, this.wy, 16);
    const s = camera.worldToScreen(this.wx, this.wy);
    ctx.save();
    ctx.fillStyle = '#4169E1';
    ctx.fillRect(s.x - 12, s.y - 40, 24, 40);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x - 12, s.y - 40, 24, 40);
    ctx.restore();
    SpriteRenderer.drawNameTag(ctx, camera, this.wx, this.wy, this.name, '#00ff00');
    if (this.stats.maxHp > 0) {
      SpriteRenderer.drawHealthBar(
        ctx, camera, this.wx, this.wy, this.stats.hp / this.stats.maxHp,
      );
    }
  }
}

export default Guard;
