/**
 * Monster.js — 怪物实体
 *
 * 职责：
 * - 从 monsters.js 的 getMonster(id) 加载基础数据，构建 Stats 与运行时状态
 * - 维护完整状态机：idle / patrol / chase / attack / dead / stunned / returning
 * - 主动攻击玩家与召唤物（视野扫描 → 追击 → 普攻），脱战回归出生点并回血
 * - 受击 / 死亡 / 掉落 / 经验归属 / 复活（非 BOSS）/ buff（DOT/眩晕/诱惑/减速）
 * - 提供渲染信息与序列化，供 Scene / 存档系统使用
 *
 * 复用：
 * - monsters.js 的 getMonster / MONSTERS
 * - drops.js 的 rollDrops（死亡掉落摇奖）
 * - items.js 的 getItem（掉落物耐久上限）
 * - DropItem.js 生成地面掉落物
 * - Stats.js 维护属性
 * - Pathfinder.findPath / simplifyPath 寻路
 * - SpriteRenderer 静态方法绘制阴影 / 名字 / 血条
 * - utils/math.js 的 clamp
 *
 * 与其它系统的协作约定：
 * - 怪物普攻由本类在 attack 状态调用 game.combat.monsterAttack(this, target)（或 scene.combat）
 * - 怪物死亡后由本类 _spawnDrops 生成 DropItem 加入 scene.drops，
 *   并通过 scene.combat.applyExp(player, monster) 给最后攻击者加经验
 * - 非战斗型 buff（诱惑之光 / 施毒术 / 冰咆哮减速等）由 SkillSystem 通过 addBuff 注入
 * - MonsterSpawner 负责按地图 spawns 配置批量生成与刷新管理
 *
 * 坐标约定（与 Player.js / IsometricMap.js 一致）：
 * - 等距瓦片 64×32，瓦片中心世界坐标 wx=(tx-ty)*32, wy=(tx+ty)*16
 * - 移动速度 stats.moveSpeed 单位为"瓦片/秒"，按瓦片对角线长度换算为像素/秒
 */

import { getMonster } from '../data/monsters.js';
import { rollDrops } from '../data/drops.js';
import { getItem } from '../data/items.js';
import { DropItem } from './DropItem.js';
import { Stats } from './Stats.js';
import { Pathfinder } from '../engine/Pathfinder.js';
import { SpriteRenderer } from '../engine/SpriteRenderer.js';
import { clamp } from '../utils/math.js';

/** 等距瓦片像素尺寸（与 IsometricMap / Player 一致） */
const TILE_W = 64;
const TILE_H = 32;
/** 瓦片对角线长度（像素），作为 1 瓦片距离单位，用于换算移动速度 */
const TILE_DIAGONAL = Math.sqrt(TILE_W * TILE_W + TILE_H * TILE_H);

/** 全局自增怪物 id 计数器 */
let _nextMonsterId = 1;

/**
 * 瓦片坐标 -> 世界像素坐标（瓦片中心）
 * 与 IsometricMap.tileToWorld 公式一致，避免本类对地图实例的硬依赖。
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

export class Monster {
  /**
   * @param {string} monsterId 怪物 ID（monsters.js 的键）
   * @param {number} tx 出生瓦片 X
   * @param {number} ty 出生瓦片 Y
   * @param {object} map IsometricMap 实例（提供 isWalkable / isInSafeZone / tileToWorld）
   * @param {object} [options={}]
   * @param {number} [options.respawnMs] 复活间隔（毫秒），缺省取怪物定义 respawnMs
   * @param {object} [options.scene] 所属场景引用（也可后续由 update 回写）
   */
  constructor(monsterId, tx, ty, map, options = {}) {
    const def = getMonster(monsterId);
    if (!def) {
      throw new Error(`[Monster] 未知怪物 ID: ${monsterId}`);
    }

    /** 唯一 id（自增） */
    this.id = _nextMonsterId++;
    /** 怪物定义 ID */
    this.monsterId = monsterId;
    this.name = def.name;
    this.level = def.level;
    this.family = def.family;

    /** 地图引用（用于寻路与安全区判定） */
    this.map = map;
    /** 所属场景引用（由 update 回写，便于 die() 生成掉落 / 加经验） */
    this.scene = options.scene || null;
    /** 游戏上下文（由 update 回写，便于调用 game.combat） */
    this.game = null;

    // ===== 属性 =====
    this.stats = new Stats();
    this.stats.maxHp = def.hp;
    this.stats.hp = def.hp;
    this.stats.maxMp = def.mp || 0;
    this.stats.mp = def.mp || 0;
    this.stats.minAtk = def.minAtk;
    this.stats.maxAtk = def.maxAtk;
    this.stats.def = def.def;
    this.stats.mdef = def.mdef;
    this.stats.hit = def.hit;
    this.stats.dodge = def.dodge;
    this.stats.moveSpeed = def.moveSpeed;
    this.stats.attackRange = def.attackRange;
    this.stats.attackSpeed = def.attackSpeed;
    // 怪物无幸运/诅咒/魔攻，保持 0
    /** 经验（同时挂到 stats.exp 以兼容 monster.stats.exp 访问） */
    this.exp = def.exp;
    this.stats.exp = def.exp;

    /** 魔法攻击标记（部分怪物 damageType='magic'） */
    this.damageType = def.damageType || 'physical';

    // ===== 坐标 / 朝向 / 状态 =====
    this.tx = tx;
    this.ty = ty;
    const w = tileToWorld(tx, ty);
    this.wx = w.wx;
    this.wy = w.wy;
    /** 朝向：0=下 1=左下 2=左 3=左上 4=上 5=右上 6=右 7=右下 */
    this.facing = 0;
    /** 状态机：'idle'|'patrol'|'chase'|'attack'|'dead'|'stunned'|'returning' */
    this.state = 'idle';

    /** 出生点（脱战回归目标） */
    this.spawnTx = tx;
    this.spawnTy = ty;

    /** 当前攻击目标（玩家 / 召唤物引用） */
    this.target = null;
    /** 普攻冷却剩余毫秒 */
    this.attackCooldownMs = 0;
    /** 上次攻击时间戳（毫秒） */
    this.lastAttackMs = 0;

    /** 寻路路径（path[0] 为下一格目标瓦片） */
    this.path = [];
    /** 重新寻路计时器（秒），用于追击移动目标时周期性重算路径 */
    this._repathTimer = 0;
    /** 脱战累计时间（秒），target 距离超出视野 1.5 倍持续 5 秒后脱战 */
    this._outOfCombatTimer = 0;

    // ===== 行为标志 =====
    this.isAggressive = def.isAggressive !== false;
    this.isBoss = !!def.isBoss;
    this.visionRange = def.visionRange || 6;

    /** 主动技能列表（引用 skills.js 的技能 ID，BOSS 用） */
    this.skills = Array.isArray(def.skills) ? def.skills.slice() : [];

    // ===== buff =====
    /** @type {Array<{id,effect,value,duration,remainingMs,tickInterval,tickAccum,source}>} */
    this.buffs = [];
    /** 诱惑之光剩余毫秒（由 lure buff 同步，便于外部读取） */
    this.lureTimer = 0;

    // ===== 掉落 / 复活 =====
    /** 复活间隔（毫秒） */
    this.respawnMs = options.respawnMs != null ? options.respawnMs : (def.respawnMs || 60000);
    /** 死亡后复活倒计时（毫秒），仅非 BOSS 使用 */
    this.respawnTimer = 0;

    /** 渲染占位色与体型缩放 */
    this.color = def.color || '#888888';
    this.size = def.size || 1;

    /** 存活标记 */
    this.alive = true;

    /** 最后攻击者 id（玩家 / 召唤物），用于经验归属 */
    this.pkAttackerId = null;
  }

  // ===== 主更新 =====

  /**
   * 每帧更新：buff → 状态机
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
    if (arg3 && (arg3.monsters || arg3.drops || arg3.map)) {
      scene = arg3;
      game = arg2;
    } else if (arg1 && (arg1.monsters || arg1.drops || arg1.map)) {
      scene = arg1;
      game = arg2;
    } else {
      scene = this.scene;
      game = arg2;
    }
    if (scene) this.scene = scene;
    if (game) this.game = game;

    // 死亡：计时复活（仅非 BOSS），BOSS 永不复活
    if (this.state === 'dead' || !this.alive) {
      if (!this.isBoss) {
        this.respawnTimer -= dt * 1000;
        if (this.respawnTimer <= 0) {
          this.respawn();
        }
      }
      return;
    }

    // 更新 buff（DOT 扣血 / 眩晕 / 诱惑 / 减速计时），DOT 致死会触发 die
    this.updateBuffs(dt);
    if (this.state === 'dead' || !this.alive) return;

    // 同步 lureTimer 便于外部读取
    const lureBuff = this.buffs.find((b) => b.effect === 'lure' || b.id === 'lure');
    this.lureTimer = lureBuff ? lureBuff.remainingMs : 0;

    // 眩晕：不动作（buff 过期后自动恢复）
    if (this._hasBuff('stun')) {
      this.state = 'stunned';
      return;
    }
    // 眩晕刚解除时回到合理状态
    if (this.state === 'stunned') {
      this.state = (this._distToSpawn() > 1) ? 'returning' : 'idle';
    }

    // 诱惑：停止攻击与追击，原地待机（仍可受击）
    const lured = this._hasBuff('lure');

    switch (this.state) {
      case 'idle':
      case 'patrol': {
        if (this.isAggressive && !lured) {
          const tgt = this._scanForTarget(scene);
          if (tgt) {
            this.target = tgt;
            this.state = 'chase';
          }
        }
        break;
      }

      case 'chase': {
        if (!this._isTargetActive(this.target)) {
          this.target = null;
          this.state = 'returning';
          break;
        }
        if (lured) {
          // 被诱惑停止追击
          this.state = 'idle';
          this.path = [];
          break;
        }
        const dist = this._distToTarget();
        // 进入攻击范围 → 攻击
        if (dist <= this.stats.attackRange) {
          this.state = 'attack';
          this.path = [];
          break;
        }
        // 脱战判定：距离 > 视野 1.5 倍持续 5 秒
        if (dist > this.visionRange * 1.5) {
          this._outOfCombatTimer += dt;
          if (this._outOfCombatTimer >= 5) {
            this.target = null;
            this._outOfCombatTimer = 0;
            this.state = 'returning';
            break;
          }
        } else {
          this._outOfCombatTimer = 0;
        }
        // 朝目标寻路移动
        this._moveToward(this.target.tx, this.target.ty, dt);
        break;
      }

      case 'attack': {
        if (!this._isTargetActive(this.target)) {
          this.target = null;
          this.state = 'returning';
          break;
        }
        if (lured) {
          this.state = 'idle';
          break;
        }
        const dist = this._distToTarget();
        if (dist > this.stats.attackRange + 0.5) {
          // 目标拉开距离 → 重新追击
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
          this.lastAttackMs = Date.now();
          // 攻击后若目标已死，脱战回归
          if (!this._isTargetActive(this.target)) {
            this.target = null;
            this.state = 'returning';
            break;
          }
        }
        break;
      }

      case 'returning': {
        const distToSpawn = this._distToSpawn();
        if (distToSpawn <= 1) {
          // 到达出生点
          this.tx = this.spawnTx;
          this.ty = this.spawnTy;
          const w2 = tileToWorld(this.tx, this.ty);
          this.wx = w2.wx;
          this.wy = w2.wy;
          this.path = [];
          this.state = 'idle';
        } else {
          this._moveToward(this.spawnTx, this.spawnTy, dt);
          // 回归途中每秒回 5% maxHp
          this.stats.hp = Math.min(
            this.stats.maxHp,
            this.stats.hp + this.stats.maxHp * 0.05 * dt,
          );
        }
        // 回归途中也可重新发现目标
        if (this.isAggressive && !lured) {
          const tgt = this._scanForTarget(scene);
          if (tgt) {
            this.target = tgt;
            this.state = 'chase';
          }
        }
        break;
      }

      default:
        break;
    }
  }

  // ===== 受击 / 死亡 / 复活 =====

  /**
   * 受到伤害
   * @param {number} amount 伤害量
   * @param {string} [type='physical'] 伤害类型
   * @param {number|string} [attackerId] 攻击者 id（用于经验归属）
   */
  takeDamage(amount, type = 'physical', attackerId = null) {
    if (this.state === 'dead' || !this.alive) return;
    const dmg = Math.max(0, amount);
    this.stats.hp -= dmg;
    if (attackerId != null) this.pkAttackerId = attackerId;
    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
      this.die();
    }
  }

  /**
   * 死亡处理：标记死亡、触发掉落、给最后攻击者加经验、启动复活倒计时
   * @param {object} [scene] 所属场景（缺省取 this.scene）
   */
  die(scene) {
    scene = scene || this.scene;
    if (this.state === 'dead') return; // 防止重复结算
    this.state = 'dead';
    this.alive = false;
    this.target = null;
    this.path = [];
    // 非 BOSS 启动复活倒计时；BOSS 永不复活
    this.respawnTimer = this.isBoss ? Infinity : this.respawnMs;

    if (scene) {
      this._spawnDrops(scene);
      this._grantExp(scene);
    }
  }

  /**
   * 摇奖并生成地面掉落物，加入 scene.drops
   * @param {object} scene
   */
  _spawnDrops(scene) {
    const mapId = scene.map && scene.map.id;
    const drops = rollDrops(this.monsterId);
    for (const d of drops) {
      if (d.type === 'gold') {
        // 金币：用 itemId='gold' 约定，count 存金币数额
        const drop = new DropItem('gold', d.gold, this.tx, this.ty, mapId, null, null);
        const w = tileToWorld(this.tx, this.ty);
        drop.wx = w.wx;
        drop.wy = w.wy;
        scene.addEntity('drop', drop);
      } else if (d.type === 'item') {
        const def = getItem(d.itemId);
        const durability = def && def.maxDurability != null ? def.maxDurability : null;
        const drop = new DropItem(d.itemId, d.count, this.tx, this.ty, mapId, null, durability);
        const w = tileToWorld(this.tx, this.ty);
        drop.wx = w.wx;
        drop.wy = w.wy;
        scene.addEntity('drop', drop);
      }
    }
  }

  /**
   * 给最后攻击者（玩家）加经验
   * 优先通过 scene.combat.applyExp 结算（含等级衰减），否则直接 player.gainExp
   * @param {object} scene
   */
  _grantExp(scene) {
    if (this.pkAttackerId == null) return;
    const player = scene.player;
    if (!player || player.id !== this.pkAttackerId) return;
    const combat = (this.game && this.game.combat) || (scene && scene.combat);
    if (combat && typeof combat.applyExp === 'function') {
      combat.applyExp(player, this);
    } else if (typeof player.gainExp === 'function') {
      player.gainExp(this.exp);
    }
  }

  /**
   * 在出生点复活（仅非 BOSS 由 update 调用）
   */
  respawn() {
    this.tx = this.spawnTx;
    this.ty = this.spawnTy;
    const w = tileToWorld(this.tx, this.ty);
    this.wx = w.wx;
    this.wy = w.wy;
    this.stats.hp = this.stats.maxHp;
    this.stats.mp = this.stats.maxMp;
    this.alive = true;
    this.state = 'idle';
    this.target = null;
    this.path = [];
    this.attackCooldownMs = 0;
    this._outOfCombatTimer = 0;
    this.pkAttackerId = null;
    this.buffs = [];
    this.lureTimer = 0;
    this.respawnTimer = 0;
  }

  // ===== buff =====

  /**
   * 添加 buff（同 id 刷新，不同 id 追加）
   * buff 格式：{id, effect, value, duration, remainingMs?, tickInterval?, source?}
   *  - effect: 'poison'|'burn'|'stun'|'lure'|'slow' 等
   *  - value: DOT 每秒伤害（poison/burn）或减速比例（slow）
   *  - duration: 总时长（秒）
   *  - source: 来源（施法者 id 等，DOT 用于经验归属）
   * @param {object} buff
   */
  addBuff(buff) {
    if (!buff) return;
    const idx = this.buffs.findIndex((b) => b.id === buff.id);
    const normalized = { tickInterval: 1, tickAccum: 0, ...buff };
    if (!normalized.remainingMs) {
      normalized.remainingMs = (normalized.duration || 0) * 1000;
    }
    if (idx >= 0) this.buffs[idx] = normalized;
    else this.buffs.push(normalized);
  }

  /** 是否拥有指定 id 或 effect 的 buff */
  _hasBuff(idOrEffect) {
    return this.buffs.some((b) => b.id === idOrEffect || b.effect === idOrEffect);
  }

  /**
   * 更新 buff：DOT 结算 / 计时 / 过期移除
   * DOT 通过 takeDamage 结算，便于记录归属与触发死亡
   * @param {number} dt 帧间隔（秒）
   */
  updateBuffs(dt) {
    if (this.buffs.length === 0) return;
    const deltaMs = dt * 1000;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.remainingMs -= deltaMs;

      // DOT 结算（poison / burn）
      if ((b.effect === 'poison' || b.effect === 'burn') && this.alive) {
        b.tickAccum = (b.tickAccum || 0) + dt;
        const interval = b.tickInterval || 1;
        while (b.tickAccum >= interval && this.alive) {
          b.tickAccum -= interval;
          const dmg = b.value || 0;
          if (dmg > 0) {
            // 通过 takeDamage 结算，记录攻击者归属
            this.takeDamage(dmg, 'dot', b.source);
            if (this.state === 'dead' || !this.alive) return;
          }
        }
      }

      if (b.remainingMs <= 0) {
        this.buffs.splice(i, 1);
      }
    }
  }

  // ===== 目标 / 移动辅助 =====

  /** 目标是否仍可被攻击（存活） */
  _isTargetActive(t) {
    if (!t) return false;
    if (t.state === 'dead') return false;
    if (t.alive === false) return false;
    if (t.stats && t.stats.hp <= 0) return false;
    return true;
  }

  /**
   * 扫描视野内的玩家 / 召唤物，返回最近的有效目标
   * 安全区内的玩家不被攻击
   * @param {object} scene
   */
  _scanForTarget(scene) {
    if (!scene) return null;
    const candidates = [];
    // 玩家
    const p = scene.player;
    if (p && this._isTargetActive(p)) {
      const inSafe = this.map && this.map.isInSafeZone
        ? this.map.isInSafeZone(p.tx, p.ty)
        : false;
      if (!inSafe) candidates.push(p);
    }
    // 召唤物
    if (Array.isArray(scene.summons)) {
      for (const s of scene.summons) {
        if (s && this._isTargetActive(s)) candidates.push(s);
      }
    }
    let best = null;
    let bestDist = Infinity;
    for (const c of candidates) {
      const dx = (c.tx != null ? c.tx : 0) - this.tx;
      const dy = (c.ty != null ? c.ty : 0) - this.ty;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= this.visionRange && d < bestDist) {
        best = c;
        bestDist = d;
      }
    }
    return best;
  }

  /** 到当前目标的瓦片欧氏距离 */
  _distToTarget() {
    if (!this.target) return Infinity;
    const dx = (this.target.tx != null ? this.target.tx : 0) - this.tx;
    const dy = (this.target.ty != null ? this.target.ty : 0) - this.ty;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /** 到出生点的切比雪夫距离（用于回归判定） */
  _distToSpawn() {
    return Math.max(Math.abs(this.tx - this.spawnTx), Math.abs(this.ty - this.spawnTy));
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
   * - 路径为空或重寻路计时器到期时重算路径（追击移动目标）
   * - 减速 buff 使移动速度减半
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

  /** 沿 this.path 前进一格（与 Player 移动逻辑一致） */
  _followPath(dt) {
    if (this.path.length === 0) return;
    const target = this.path[0];
    const tw = tileToWorld(target.tx, target.ty);
    const dx = tw.wx - this.wx;
    const dy = tw.wy - this.wy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // 速度：瓦片/秒 → 像素/秒
    let speedPxPerSec = (this.stats.moveSpeed || 0) * TILE_DIAGONAL;
    if (this._hasBuff('slow')) speedPxPerSec *= 0.5; // 减速 50%
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

  /** 内部：精灵描述信息（颜色 / 锚点 / 缩放） */
  _getSpriteInfo() {
    return {
      image: null,
      color: this.color,
      frame: null,
      anchorX: 0.5,
      anchorY: 1.0,
      scale: this.size || 1,
    };
  }

  /**
   * 获取精灵描述：
   * - 带 camera 参数：供 Scene.render 的 _wrapEntity 使用，返回 {sortY, draw}
   * - 无 camera 参数：返回精灵信息（与 Player.getSprite 一致）
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
    return this._getSpriteInfo();
  }

  /** 实际绘制：阴影 + 色块占位 + 名字 + 血条 */
  _render(ctx, camera) {
    const radius = 14 * (this.size || 1);
    SpriteRenderer.drawShadow(ctx, camera, this.wx, this.wy, radius);
    // 无图阶段：色块占位
    const s = camera.worldToScreen(this.wx, this.wy);
    const bw = 24 * (this.size || 1);
    const bh = 40 * (this.size || 1);
    // BOSS 死亡后用半透明描边尸体
    const dead = this.state === 'dead' || !this.alive;
    ctx.save();
    if (dead) ctx.globalAlpha = 0.5;
    ctx.fillStyle = this.color;
    ctx.fillRect(s.x - bw / 2, s.y - bh, bw, bh);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x - bw / 2, s.y - bh, bw, bh);
    ctx.restore();
    if (dead) return; // 尸体不显示名字/血条
    SpriteRenderer.drawNameTag(
      ctx, camera, this.wx, this.wy,
      `${this.name} Lv${this.level}`, '#ff5050',
    );
    if (this.stats.maxHp > 0) {
      SpriteRenderer.drawHealthBar(
        ctx, camera, this.wx, this.wy, this.stats.hp / this.stats.maxHp,
      );
    }
  }

  /**
   * 获取渲染信息（供外部 Y 排序 / HUD 使用）
   * @returns {{worldX:number, worldY:number, sprite:object, name:string, hpRatio:number, nameColor:string, level:number}}
   */
  getRenderInfo() {
    return {
      worldX: this.wx,
      worldY: this.wy,
      sprite: this._getSpriteInfo(),
      name: this.name,
      hpRatio: this.stats.maxHp > 0 ? this.stats.hp / this.stats.maxHp : 0,
      nameColor: '#ff5050',
      level: this.level,
    };
  }

  /** 世界坐标 X（供 Scene.getEntitiesInRange 使用） */
  get worldX() { return this.wx; }
  /** 世界坐标 Y */
  get worldY() { return this.wy; }

  // ===== 序列化 =====

  serialize() {
    return {
      id: this.id,
      monsterId: this.monsterId,
      name: this.name,
      level: this.level,
      family: this.family,
      tx: this.tx,
      ty: this.ty,
      wx: this.wx,
      wy: this.wy,
      facing: this.facing,
      state: this.state,
      spawnTx: this.spawnTx,
      spawnTy: this.spawnTy,
      isBoss: this.isBoss,
      isAggressive: this.isAggressive,
      visionRange: this.visionRange,
      color: this.color,
      size: this.size,
      alive: this.alive,
      exp: this.exp,
      damageType: this.damageType,
      respawnMs: this.respawnMs,
      respawnTimer: this.respawnTimer,
      attackCooldownMs: this.attackCooldownMs,
      pkAttackerId: this.pkAttackerId,
      skills: this.skills.slice(),
      buffs: this.buffs.map((b) => ({ ...b })),
      stats: this.stats.serialize(),
      // 当前 hp/mp 单独记录（Stats.serialize 已含，这里冗余便于读取）
      hp: this.stats.hp,
      mp: this.stats.mp,
    };
  }

  /**
   * 反序列化重建 Monster
   * @param {object} data
   * @param {object} map IsometricMap 实例
   * @returns {Monster}
   */
  static deserialize(data, map) {
    const m = new Monster(data.monsterId, data.tx, data.ty, map, {
      respawnMs: data.respawnMs,
    });
    if (data.id != null) {
      m.id = data.id;
      if (m.id >= _nextMonsterId) _nextMonsterId = m.id + 1;
    }
    m.name = data.name || m.name;
    m.level = data.level || m.level;
    m.family = data.family || m.family;
    m.wx = data.wx != null ? data.wx : m.wx;
    m.wy = data.wy != null ? data.wy : m.wy;
    m.facing = data.facing || 0;
    m.state = data.state || 'idle';
    m.spawnTx = data.spawnTx != null ? data.spawnTx : m.spawnTx;
    m.spawnTy = data.spawnTy != null ? data.spawnTy : m.spawnTy;
    m.isBoss = !!data.isBoss;
    m.isAggressive = data.isAggressive !== false;
    m.visionRange = data.visionRange || m.visionRange;
    m.color = data.color || m.color;
    m.size = data.size || m.size;
    m.alive = data.alive !== false;
    m.exp = data.exp != null ? data.exp : m.exp;
    m.stats.exp = m.exp;
    m.damageType = data.damageType || 'physical';
    m.respawnMs = data.respawnMs != null ? data.respawnMs : m.respawnMs;
    m.respawnTimer = data.respawnTimer || 0;
    m.attackCooldownMs = data.attackCooldownMs || 0;
    m.pkAttackerId = data.pkAttackerId != null ? data.pkAttackerId : null;
    m.skills = Array.isArray(data.skills) ? data.skills.slice() : m.skills;
    m.buffs = Array.isArray(data.buffs) ? data.buffs.map((b) => ({ ...b })) : [];
    // 恢复 hp/mp（保持序列化时的当前值）
    if (data.stats) {
      const s = Stats.deserialize(data.stats);
      m.stats = s;
    }
    if (data.hp != null) m.stats.hp = data.hp;
    if (data.mp != null) m.stats.mp = data.mp;
    // BOSS 死亡保持死亡
    if (m.state === 'dead') m.alive = false;
    return m;
  }
}

export default Monster;
