/**
 * SkillSystem.js — 技能效果执行器
 *
 * 职责：
 * - 接收施法回调（Player.onCastSkill / 怪物 AI），按 skill.type 分发执行各技能效果
 * - 维护施法产生的短时实体：视觉特效 / 飘字 / 火墙 / DOT / 眩晕 / 减速 / 诱惑 等
 * - 投射物 / 召唤物通过 scene.addEntity 添加，由 Scene 自动驱动与清理
 * - 通过 combat.applyDamage 结算伤害（命中 / 闪避 / 暴击由 CombatSystem 决定）；
 *   本系统只负责计算基础伤害区间与技能倍率 / 不死系加成 / 无视防御等修饰
 *
 * 与 CombatSystem 的接口约定（combat 由后续任务实现）：
 *   combat.applyDamage(attacker, target, damage, type, options) -> {amount:number, miss:boolean, crit:boolean}
 *   - attacker：施法者（玩家 / 怪物 / 召唤物 / null 表示环境）
 *   - target：目标实体（需有 takeDamage）
 *   - damage：{min,max} 区间 或 单数值
 *   - type：'physical' | 'magic' | 'poison' | 'fire' 等
 *   - options：{ ignoreDef?:number(0~1 忽略防御比例) }
 *   - 返回最终结算结果（amount=0 表示未命中或被完全吸收）
 * 当 combat 缺省时，本系统走 fallback：在区间内随机取整后直接 target.takeDamage，
 * 保证技能系统在 CombatSystem 未接入时仍可独立运行 / 测试。
 *
 * 实体鸭子类型：Projectile / Summon / Effect / FireWall / DamageText 均实现 update / getRenderInfo。
 * Projectile / Summon 走 Scene；Effect / FireWall / DamageText 由本系统自持集合驱动
 * （当前 Scene 实体类型未含 effect / firewall / damagetext）。
 */

import { computeDamage } from '../data/skills.js';
import { distance, randInt, randFloat, clamp } from '../utils/math.js';
import { Projectile } from './Projectile.js';
import { Summon } from './Summon.js';
import { VisualEffect as Effect } from './Effect.js';
import { FireWall } from './FireWall.js';
import { DamageText } from './DamageText.js';

const TILE_W = 64;
const TILE_H = 32;

function tileToWorld(tx, ty) {
  return { wx: (tx - ty) * (TILE_W / 2), wy: (tx + ty) * (TILE_H / 2) };
}

/**
 * 8 方向 facing -> 瓦片位移向量
 * facing：0=下(0,1) 1=左下(-1,1) 2=左(-1,0) 3=左上(-1,-1)
 *         4=上(0,-1) 5=右上(1,-1) 6=右(1,0) 7=右下(1,1)
 */
const FACING_DIRS = [
  [0, 1], [-1, 1], [-1, 0], [-1, -1],
  [0, -1], [1, -1], [1, 0], [1, 1],
];

export class SkillSystem {
  /**
   * @param {object} scene Scene 实例
   * @param {object} [combat] CombatSystem 实例（后续任务实现，缺省走 fallback）
   */
  constructor(scene, combat = null) {
    this.scene = scene;
    this.combat = combat || null;

    // 自持短时实体集合（由 update(dt) 驱动）
    /** @type {Array<Effect>} */
    this.effects = [];
    /** @type {Array<DamageText>} */
    this.damageTexts = [];
    /** @type {Array<FireWall>} */
    this.fireWalls = [];
    /** @type {Array<{target, type, damage, durationMs, remainingMs, tickMs, nextTickMs, stacks, maxStacks, owner}>} */
    this.dots = [];
    /** @type {Array<{target, remainingMs}>} */
    this.stuns = [];
    /** @type {Array<{target, type:'slow'|'lure', remainingMs, factor?}>} */
    this.statusEffects = [];
  }

  // ===== 对外主入口 =====

  /**
   * 执行技能效果（由 Player.onCastSkill / 怪物 AI 调用）
   * @param {object} caster 施法者
   * @param {object} skill 技能定义
   * @param {number} skillLevel 技能等级
   * @param {number} targetX 目标瓦片 X
   * @param {number} targetY 目标瓦片 Y
   * @param {object} [game] 游戏上下文
   */
  execute(caster, skill, skillLevel, targetX, targetY, game) {
    if (!caster || !skill) return;

    // 施法视觉特效
    this._spawnEffect('cast', caster.tx, caster.ty);

    switch (skill.type) {
      case 'melee':
        this._executeMelee(caster, skill, skillLevel, targetX, targetY);
        break;
      case 'projectile':
        this._executeProjectile(caster, skill, skillLevel, targetX, targetY);
        break;
      case 'aoe':
        this._executeAoe(caster, skill, skillLevel, targetX, targetY);
        break;
      case 'buff':
        this._executeBuff(caster, skill, skillLevel, targetX, targetY);
        break;
      case 'debuff':
        this._executeDebuff(caster, skill, skillLevel, targetX, targetY);
        break;
      case 'summon':
        this._executeSummon(caster, skill, skillLevel, targetX, targetY);
        break;
      case 'teleport':
        this._executeTeleport(caster, skill, skillLevel);
        break;
      default:
        break;
    }
  }

  // ===== 近战技能 =====

  _executeMelee(caster, skill, skillLevel, targetX, targetY) {
    const facing = this._getFacing(caster, targetX, targetY);
    switch (skill.id) {
      case 'basic_swordmanship': {
        const target = this._selectMeleeTarget(caster, targetX, targetY);
        this._dealSkillDamage(caster, target, skill, skillLevel, 'physical');
        break;
      }
      case 'attack_slash': {
        const target = this._selectMeleeTarget(caster, targetX, targetY);
        this._dealSkillDamage(caster, target, skill, skillLevel, 'physical');
        // 30% 概率追加一次伤害
        if (target && randFloat(0, 1) < (skill.flags && skill.flags.extraHitChance || 0.3)) {
          this._dealSkillDamage(caster, target, skill, skillLevel, 'physical');
        }
        break;
      }
      case 'thrust_slash': {
        // 穿透直线 2 格，无视 50% 防御
        const targets = this._lineTargets(caster, facing, 2);
        const range = this._computeRange(caster, skill, skillLevel);
        for (const t of targets) {
          this._applyAndShow(caster, t, range, 'physical', { ignoreDef: 0.5 });
        }
        break;
      }
      case 'fire_blade': {
        const target = this._selectMeleeTarget(caster, targetX, targetY);
        this._dealSkillDamage(caster, target, skill, skillLevel, 'physical');
        // 附加 3 秒燃烧 DOT（每秒 30% 物攻）
        if (target) {
          const atk = this._casterAtk(caster, 'physical');
          const burnRange = { min: 0.3 * atk.min, max: 0.3 * atk.max };
          this.applyDOT(target, burnRange, 3000, false, 'burn', 1, caster);
        }
        break;
      }
      case 'savage_charge': {
        // 突进 3 格，撞到的敌人 1.5x 物攻 + 眩晕 1 秒
        this._doCharge(caster, facing, 3, skill, skillLevel, targetX, targetY);
        break;
      }
      default: {
        // 通用近战：对目标瓦片上的敌人造成技能伤害
        const target = this._selectMeleeTarget(caster, targetX, targetY);
        this._dealSkillDamage(caster, target, skill, skillLevel, 'physical');
        break;
      }
    }
  }

  /** 野蛮冲撞：瞬移 3 格并对落点附近敌人造成伤害 + 眩晕 */
  _doCharge(caster, facing, maxSteps, skill, skillLevel, targetX, targetY) {
    const [dx, dy] = FACING_DIRS[facing] || [0, 1];
    const dest = this._dashTile(caster, dx, dy, maxSteps);
    // 瞬移施法者
    caster.tx = dest.tx;
    caster.ty = dest.ty;
    const w = tileToWorld(dest.tx, dest.ty);
    caster.wx = w.wx;
    caster.wy = w.wy;
    this._spawnEffect('cast', dest.tx, dest.ty);

    // 落点附近 1.5 格内的敌人
    const range = this._computeRange(caster, skill, skillLevel);
    const enemies = this._getEnemies(caster).filter(
      (e) => distance(dest.tx, dest.ty, e.tx, e.ty) <= 1.5
    );
    for (const t of enemies) {
      this._applyAndShow(caster, t, range, 'physical', {});
      this.applyStun(t, 1000);
    }
  }

  // ===== 投射物技能 =====

  _executeProjectile(caster, skill, skillLevel, targetX, targetY) {
    // 在技能射程内寻找最近目标
    const clamped = this._clampTarget(caster, targetX, targetY, skill.range || 5);
    const targetEntity = this._selectRangedTarget(caster, clamped.tx, clamped.ty, skill.range || 5);

    const proj = new Projectile(
      caster,
      targetEntity,
      skill,
      skillLevel,
      caster.tx,
      caster.ty
    );
    // 若没有目标实体，则朝目标点射击
    if (!targetEntity) {
      proj.targetTx = clamped.tx;
      proj.targetTy = clamped.ty;
    }

    const self = this;
    proj.onHit = (tgt, p, _sc) => {
      if (!tgt) {
        self._spawnEffect('hit', p.tx, p.ty);
        return;
      }
      let dmg = p.damage;
      if (dmg) {
        const flags = (p.skill && p.skill.flags) || {};
        if (flags.undeadBonus && tgt.family === 'undead') {
          dmg = { min: dmg.min * flags.undeadBonus, max: dmg.max * flags.undeadBonus };
        }
        self._applyAndShow(caster, tgt, dmg, p.damageType, {});
      }
      self._spawnEffect('hit', tgt.tx, tgt.ty);
    };

    this.scene.addEntity('projectile', proj);
  }

  // ===== AOE 技能 =====

  _executeAoe(caster, skill, skillLevel, targetX, targetY) {
    const shape = skill.aoeShape;
    if (shape === 'cone') {
      // 半月弯刀：前方锥形 AOE
      this._doCone(caster, skill, skillLevel, targetX, targetY);
      return;
    }
    if (shape === 'line') {
      // 火墙术：放置 3 格火墙
      this._doFireWall(caster, skill, skillLevel, targetX, targetY);
      return;
    }
    // circle: repel_fire / hell_thunder / blizzard
    if (skill.id === 'repel_fire') {
      this._doRepelFire(caster, skill, skillLevel);
    } else if (skill.id === 'hell_thunder') {
      this._doCircleAoe(caster, skill, skillLevel, targetX, targetY, 'aoe_thunder', true);
    } else if (skill.id === 'blizzard') {
      this._doBlizzard(caster, skill, skillLevel, targetX, targetY);
    } else {
      // 通用圆形 AOE
      this._doCircleAoe(caster, skill, skillLevel, targetX, targetY, 'aoe_fire', false);
    }
  }

  /** 半月弯刀：前方 3 格锥形（facing ± 45°）物理伤害 */
  _doCone(caster, skill, skillLevel, targetX, targetY) {
    const facing = this._getFacing(caster, targetX, targetY);
    const radius = skill.aoeRadius || 3;
    const targets = this._coneTargets(caster, facing, radius);
    const range = this._computeRange(caster, skill, skillLevel);
    for (const t of targets) {
      this._applyAndShow(caster, t, range, 'physical', {});
    }
    if (targets.length > 0) this._spawnEffect('aoe_fire', caster.tx, caster.ty, { radius });
  }

  /** 抗拒火环：自身周围 1 格，推开敌人 + 少量伤害 */
  _doRepelFire(caster, skill, skillLevel) {
    const radius = skill.aoeRadius || 1;
    const enemies = this._getEnemies(caster).filter(
      (e) => distance(caster.tx, caster.ty, e.tx, e.ty) <= radius + 0.5
    );
    const range = this._computeRange(caster, skill, skillLevel);
    for (const t of enemies) {
      this._applyAndShow(caster, t, range, 'magic', {});
      this._repel(caster, t, 1);
    }
    this._spawnEffect('aoe_fire', caster.tx, caster.ty, { radius: radius + 0.5 });
  }

  /** 地狱雷光 / 通用圆形 AOE：目标位置半径 2 格，可选不死系加成 */
  _doCircleAoe(caster, skill, skillLevel, targetX, targetY, effectType, undeadBonus) {
    const clamped = this._clampTarget(caster, targetX, targetY, skill.range || 5);
    const radius = skill.aoeRadius || 2;
    const enemies = this._getEnemies(caster).filter(
      (e) => distance(clamped.tx, clamped.ty, e.tx, e.ty) <= radius + 0.5
    );
    let range = this._computeRange(caster, skill, skillLevel);
    const bonus = undeadBonus && skill.flags ? skill.flags.undeadBonus : null;
    for (const t of enemies) {
      let r = range;
      if (bonus && t.family === 'undead') {
        r = { min: r.min * bonus, max: r.max * bonus };
      }
      this._applyAndShow(caster, t, r, 'magic', {});
    }
    this._spawnEffect(effectType, clamped.tx, clamped.ty, { radius });
  }

  /** 冰咆哮：圆形 AOE 伤害 + 减速 50% 3 秒 */
  _doBlizzard(caster, skill, skillLevel, targetX, targetY) {
    const clamped = this._clampTarget(caster, targetX, targetY, skill.range || 6);
    const radius = skill.aoeRadius || 2;
    const enemies = this._getEnemies(caster).filter(
      (e) => distance(clamped.tx, clamped.ty, e.tx, e.ty) <= radius + 0.5
    );
    const range = this._computeRange(caster, skill, skillLevel);
    const slowFactor = (skill.effectValue && skill.effectValue.base) || 0.5;
    const slowMs = (skill.effectDuration || 3) * 1000;
    for (const t of enemies) {
      this._applyAndShow(caster, t, range, 'magic', {});
      this.applySlow(t, slowFactor, slowMs);
    }
    this._spawnEffect('aoe_ice', clamped.tx, clamped.ty, { radius });
  }

  /** 火墙术：在目标位置放置 3 格火墙，持续 8 秒 */
  _doFireWall(caster, skill, skillLevel, targetX, targetY) {
    const clamped = this._clampTarget(caster, targetX, targetY, skill.range || 5);
    const tiles = this._lineTiles(caster, clamped.tx, clamped.ty, skill.aoeLength || 3);
    const damagePerTick = this._computeRange(caster, skill, skillLevel);
    const durationMs = (skill.effectDuration || 8) * 1000;
    const fw = new FireWall(tiles, durationMs, damagePerTick, caster);
    const self = this;
    fw.onTick = (tgt) => {
      self._applyAndShow(caster, tgt, fw.damagePerTick, 'magic', {}, '#ff6600');
    };
    this.fireWalls.push(fw);
    for (const t of tiles) this._spawnEffect('aoe_fire', t.tx, t.ty, { radius: 0.6 });
  }

  // ===== 增益技能 =====

  _executeBuff(caster, skill, skillLevel, targetX, targetY) {
    switch (skill.effect) {
      case 'heal': {
        // 治愈友方（含自己）：本系统按单玩家场景，治疗施法者（玩家）
        const target = this._selectHealTarget(caster, targetX, targetY, skill.range || 3);
        if (!target) return;
        const ev = skill.effectValue || {};
        const amount = (ev.base || 0) + (ev.perLevel || 0) * skillLevel;
        if (typeof target.heal === 'function') target.heal(amount);
        this.damageTexts.push(new DamageText(target.tx, target.ty, `+${Math.round(amount)}`, '#66ff66'));
        this._spawnEffect('cast', target.tx, target.ty, { color: '#66ff66' });
        break;
      }
      case 'shield': {
        // 魔法盾：吸收量 = maxMp × coefficient，30 秒
        const maxMp = this._casterMaxMp(caster);
        const coeff = (skill.effectValue && skill.effectValue.coefficient) || 2.0;
        const absorb = maxMp * coeff;
        const buff = {
          id: 'magic_shield',
          effect: 'shield',
          absorb,
          remainingMs: (skill.effectDuration || 30) * 1000,
          duration: skill.effectDuration || 30,
          source: caster,
        };
        this._addBuff(caster, buff);
        this._spawnEffect('buff_shield', caster.tx, caster.ty);
        break;
      }
      case 'speed_up': {
        // 精神力战法：命中 + 魔攻 buff，5 分钟
        const ev = skill.effectValue || {};
        const stats = {};
        if (ev.hit) stats.hit = ev.hit;
        if (ev.minMatk) stats.minMatk = ev.minMatk;
        if (ev.maxMatk) stats.maxMatk = ev.maxMatk;
        const buff = {
          id: 'spirit_force',
          stats,
          remainingMs: (skill.effectDuration || 300) * 1000,
          duration: skill.effectDuration || 300,
        };
        this._addBuff(caster, buff);
        this._spawnEffect('buff_shield', caster.tx, caster.ty, { color: '#aaff88' });
        break;
      }
      case 'hide': {
        // 隐身术：20 秒，移动或攻击解除（解除逻辑由 Player / 战斗系统判定）
        const buff = {
          id: 'hide',
          effect: 'hide',
          remainingMs: (skill.effectDuration || 20) * 1000,
          duration: skill.effectDuration || 20,
          flags: skill.flags || {},
        };
        this._addBuff(caster, buff);
        this._spawnEffect('buff_shield', caster.tx, caster.ty, { color: '#cccccc' });
        break;
      }
      default:
        break;
    }
  }

  // ===== 减益技能 =====

  _executeDebuff(caster, skill, skillLevel, targetX, targetY) {
    const target = this._selectRangedTarget(caster, targetX, targetY, skill.range || 3);
    if (!target) return;

    switch (skill.effect) {
      case 'poison': {
        const ev = skill.effectValue || {};
        const dmgPerTick = (ev.base || 0) + (ev.perLevel || 0) * skillLevel;
        const maxStacks = (skill.flags && skill.flags.maxStacks) || 3;
        this.applyDOT(target, dmgPerTick, (skill.effectDuration || 8) * 1000, true, 'poison', maxStacks, caster);
        this._spawnEffect('poison_cloud', target.tx, target.ty);
        break;
      }
      case 'lure': {
        // 诱惑之光：BOSS 无效
        const bossImmune = !!(skill.flags && skill.flags.bossImmune);
        if (bossImmune && target.isBoss) return;
        this.applyLure(target, (skill.effectDuration || 5) * 1000);
        this._spawnEffect('cast', target.tx, target.ty, { color: '#cc99ff' });
        break;
      }
      default:
        break;
    }
  }

  // ===== 召唤技能 =====

  _executeSummon(caster, skill, skillLevel, targetX, targetY) {
    const summonId = skill.summonId || 'skeleton';
    const clamped = this._clampTarget(caster, targetX, targetY, skill.range || 1);
    // 落点不可走则退回到施法者身边
    let tx = clamped.tx;
    let ty = clamped.ty;
    if (!this._isWalkable(tx, ty)) {
      tx = caster.tx;
      ty = caster.ty;
    }
    const summon = new Summon(caster, summonId, tx, ty, this.scene.map);
    this.scene.addEntity('summon', summon);
    if (Array.isArray(caster.summonIds)) caster.summonIds.push(summon.id);
    this._spawnEffect('cast', tx, ty, { color: '#aaff66' });
  }

  // ===== 瞬移技能 =====

  _executeTeleport(caster, _skill, _skillLevel) {
    const map = this.scene && this.scene.map;
    if (!map) return;
    for (let i = 0; i < 80; i++) {
      const rx = randInt(0, (map.width || 1) - 1);
      const ry = randInt(0, (map.height || 1) - 1);
      if (map.inBounds && !map.inBounds(rx, ry)) continue;
      if (map.isWalkable && !map.isWalkable(rx, ry)) continue;
      this._spawnEffect('cast', caster.tx, caster.ty);
      caster.tx = rx;
      caster.ty = ry;
      const w = tileToWorld(rx, ry);
      caster.wx = w.wx;
      caster.wy = w.wy;
      this._spawnEffect('cast', rx, ry);
      return;
    }
  }

  // ===== DOT / 眩晕 / 减速 / 诱惑 =====

  /**
   * 添加或刷新 DOT
   * @param {object} target 目标
   * @param {number|{min:number,max:number}} damage 每秒伤害（数值或区间）
   * @param {number} durationMs 持续时间
   * @param {boolean} [stackable=true] 是否可叠加
   * @param {string} [type='dot'] DOT 类型 'dot'|'poison'|'burn'
   * @param {number} [maxStacks=3] 最大叠加层数
   * @param {object} [owner=null] 伤害归属（施法者）
   */
  applyDOT(target, damage, durationMs, stackable = true, type = 'dot', maxStacks = 3, owner = null) {
    if (!target || this._isDead(target)) return;
    const existing = this.dots.find((d) => d.target === target && d.type === type);
    if (existing) {
      existing.damage = damage;
      existing.durationMs = durationMs;
      existing.remainingMs = durationMs;
      existing.owner = owner || existing.owner;
      if (stackable && existing.stacks < maxStacks) existing.stacks++;
      existing.nextTickMs = Math.min(existing.nextTickMs > 0 ? existing.nextTickMs : 1000, 1000);
    } else {
      this.dots.push({
        target,
        type,
        damage,
        durationMs,
        remainingMs: durationMs,
        tickMs: 1000,
        nextTickMs: 1000,
        stacks: 1,
        maxStacks,
        owner,
      });
    }
  }

  /**
   * 添加眩晕 buff：target.state='stunned'，update 中跳过行动
   *
   * - 怪物（有 addBuff 且为怪物类型）：走 addBuff({effect:'stun'}) 原生通路，
   *   由 Monster.updateBuffs 自动置 state='stunned' 并在过期后恢复
   * - 玩家等无原生眩晕处理的单位：直接置 state='stunned'，由本系统倒计时恢复
   *
   * @param {object} target 目标
   * @param {number} durationMs 持续时间
   */
  applyStun(target, durationMs) {
    if (!target || this._isDead(target)) return;
    const sec = durationMs / 1000;
    if (typeof target.addBuff === 'function') {
      target.addBuff({ id: 'stun', effect: 'stun', duration: sec, remainingMs: durationMs });
    }
    if (!this._isMonsterLike(target)) {
      target.state = 'stunned';
      this.stuns.push({ target, remainingMs: durationMs });
    }
  }

  /**
   * 添加减速 buff
   * - 怪物走 addBuff({effect:'slow'}) 原生通路（Monster 移动速度减半）
   * - 玩家等无原生处理的单位：设置 slowRemainingMs / slowFactor 字段并由本系统倒计时
   * @param {object} target 目标
   * @param {number} factor 速度系数（0.5 = 减速 50%）
   * @param {number} durationMs 持续时间
   */
  applySlow(target, factor, durationMs) {
    if (!target || this._isDead(target)) return;
    const sec = durationMs / 1000;
    if (typeof target.addBuff === 'function') {
      target.addBuff({ id: 'slow', effect: 'slow', value: factor, duration: sec, remainingMs: durationMs });
    }
    target.slowRemainingMs = durationMs;
    target.slowFactor = factor;
    if (!this._isMonsterLike(target)) {
      this.statusEffects.push({ target, type: 'slow', remainingMs: durationMs, factor });
    }
  }

  /**
   * 添加诱惑 buff（停止攻击，BOSS 无效）
   * - 怪物走 addBuff({effect:'lure'}) 原生通路（Monster 停止追击 / 攻击）
   * - 玩家等无原生处理的单位：设置 lureRemainingMs 字段并由本系统倒计时
   * @param {object} target 目标
   * @param {number} durationMs 持续时间
   */
  applyLure(target, durationMs) {
    if (!target || this._isDead(target)) return;
    if (target.isBoss) return; // BOSS 免疫
    const sec = durationMs / 1000;
    if (typeof target.addBuff === 'function') {
      target.addBuff({ id: 'lure', effect: 'lure', duration: sec, remainingMs: durationMs });
    }
    target.lureRemainingMs = durationMs;
    if (!this._isMonsterLike(target)) {
      this.statusEffects.push({ target, type: 'lure', remainingMs: durationMs });
    }
  }

  // ===== 主驱动 =====

  /**
   * 每帧更新：驱动所有自持短时实体 / DOT / 眩晕 / 减益
   * 由游戏主循环调用（Scene 不会驱动这些集合）。
   * @param {number} dt 帧间隔（秒）
   */
  update(dt) {
    this._updateEffects(dt);
    this._updateDamageTexts(dt);
    this._updateFireWalls(dt);
    this._updateDots(dt);
    this._updateStuns(dt);
    this._updateStatusEffects(dt);
  }

  _updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.update(dt);
      if (!e.alive) this.effects.splice(i, 1);
    }
  }

  _updateDamageTexts(dt) {
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const t = this.damageTexts[i];
      t.update(dt);
      if (!t.alive) this.damageTexts.splice(i, 1);
    }
  }

  _updateFireWalls(dt) {
    for (let i = this.fireWalls.length - 1; i >= 0; i--) {
      const fw = this.fireWalls[i];
      fw.update(dt, this.scene);
      if (!fw.alive) this.fireWalls.splice(i, 1);
    }
  }

  _updateDots(dt) {
    for (let i = this.dots.length - 1; i >= 0; i--) {
      const d = this.dots[i];
      if (!d.target || this._isDead(d.target)) {
        this.dots.splice(i, 1);
        continue;
      }
      d.remainingMs -= dt * 1000;
      d.nextTickMs -= dt * 1000;
      if (d.nextTickMs <= 0 && d.remainingMs > 0) {
        d.nextTickMs += d.tickMs;
        let amt;
        if (typeof d.damage === 'number') amt = d.damage;
        else amt = randInt(Math.floor(d.damage.min), Math.floor(d.damage.max));
        amt = amt * d.stacks;
        const dmgType = d.type === 'poison' ? 'poison' : (d.type === 'burn' ? 'fire' : 'magic');
        const color = d.type === 'poison' ? '#99cc66' : '#ff6600';
        this._applyAndShow(d.owner || null, d.target, amt, dmgType, {}, color);
      }
      if (d.remainingMs <= 0) this.dots.splice(i, 1);
    }
  }

  _updateStuns(dt) {
    for (let i = this.stuns.length - 1; i >= 0; i--) {
      const s = this.stuns[i];
      s.remainingMs -= dt * 1000;
      if (s.remainingMs <= 0) {
        if (s.target && s.target.state === 'stunned') s.target.state = 'idle';
        this.stuns.splice(i, 1);
      }
    }
  }

  _updateStatusEffects(dt) {
    for (let i = this.statusEffects.length - 1; i >= 0; i--) {
      const e = this.statusEffects[i];
      e.remainingMs -= dt * 1000;
      if (e.target) {
        if (e.type === 'slow') {
          e.target.slowRemainingMs = Math.max(0, e.remainingMs);
          e.target.slowFactor = e.remainingMs > 0 ? e.factor : 0;
        } else if (e.type === 'lure') {
          e.target.lureRemainingMs = Math.max(0, e.remainingMs);
        }
      }
      if (e.remainingMs <= 0) this.statusEffects.splice(i, 1);
    }
  }

  // ===== 渲染集合访问器（供渲染层遍历） =====

  getEffects() { return this.effects; }
  getDamageTexts() { return this.damageTexts; }
  getFireWalls() { return this.fireWalls; }

  // ===== 内部工具 =====

  /** 施法者是否为玩家 */
  _isPlayer(caster) {
    return !!caster && (caster === (this.scene && this.scene.player) || caster.classId != null);
  }

  /**
   * 目标是否为"怪物类"实体（具备原生 addBuff buff 处理通路）
   * - Monster 实例持有 monsterId 字段，且 update() 中调用 updateBuffs 处理 stun/slow/lure
   * - 玩家 / 召唤物等无原生 buff 处理通路，需由本系统自管理倒计时
   * @param {object} target
   * @returns {boolean}
   */
  _isMonsterLike(target) {
    if (!target) return false;
    return target.monsterId != null;
  }

  /** 单位是否已死亡 / 失效 */
  _isDead(e) {
    if (!e) return true;
    if (e.state === 'dead' || e.dead === true || e.alive === false) return true;
    if (e.hp != null && e.hp <= 0) return true;
    if (e.stats && e.stats.hp != null && e.stats.hp <= 0) return true;
    return false;
  }

  /** 取施法者的敌对单位列表 */
  _getEnemies(caster) {
    const sc = this.scene;
    if (!sc) return [];
    if (this._isPlayer(caster)) {
      return (sc.monsters || []).filter((m) => m && !this._isDead(m));
    }
    // 怪物施法者：玩家 + 玩家的召唤物
    const arr = [];
    if (sc.player && !this._isDead(sc.player)) arr.push(sc.player);
    for (const s of sc.summons || []) {
      if (s && !this._isDead(s)) arr.push(s);
    }
    return arr;
  }

  /** 取施法者朝向（优先 caster.facing，否则由 caster→target 推导） */
  _getFacing(caster, targetX, targetY) {
    if (caster.facing != null) return caster.facing;
    const dx = targetX - caster.tx;
    const dy = targetY - caster.ty;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return 0;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    return (Math.round(a / (Math.PI / 4)) + 6) % 8;
  }

  /** 位移向量 -> 8 方向索引 */
  _dir8(dx, dy) {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return -1;
    let a = Math.atan2(dy, dx);
    if (a < 0) a += Math.PI * 2;
    return (Math.round(a / (Math.PI / 4)) + 6) % 8;
  }

  /** 构造 computeDamage 所需的施法者视图 */
  _casterView(caster, skillLevel) {
    const s = (caster && caster.stats) || {};
    return {
      skillLevel,
      minAtk: s.minAtk != null ? s.minAtk : (caster.minAtk || 0),
      maxAtk: s.maxAtk != null ? s.maxAtk : (caster.maxAtk || 0),
      minMatk: s.minMatk != null ? s.minMatk : (caster.minMatk || 0),
      maxMatk: s.maxMatk != null ? s.maxMatk : (caster.maxMatk || 0),
    };
  }

  /** 取施法者攻击属性区间 */
  _casterAtk(caster, type) {
    const s = (caster && caster.stats) || {};
    if (type === 'magic') {
      return { min: s.minMatk != null ? s.minMatk : (caster.minMatk || 0), max: s.maxMatk != null ? s.maxMatk : (caster.maxMatk || 0) };
    }
    return { min: s.minAtk != null ? s.minAtk : (caster.minAtk || 0), max: s.maxAtk != null ? s.maxAtk : (caster.maxAtk || 0) };
  }

  /** 取施法者 MP 上限 */
  _casterMaxMp(caster) {
    const s = (caster && caster.stats) || {};
    return s.maxMp != null ? s.maxMp : (caster.maxMp || 0);
  }

  /** 计算技能基础伤害区间 */
  _computeRange(caster, skill, skillLevel) {
    return computeDamage(skill, this._casterView(caster, skillLevel));
  }

  /** 取施法者攻击范围（瓦片） */
  _attackRange(caster) {
    const s = caster && caster.stats;
    if (s && s.attackRange != null) return s.attackRange;
    return caster && caster.attackRange != null ? caster.attackRange : 1;
  }

  /** 在攻击范围内选取最接近目标瓦片的敌人（单体近战） */
  _selectMeleeTarget(caster, targetX, targetY) {
    const range = this._attackRange(caster);
    const candidates = this._getEnemies(caster).filter(
      (e) => distance(caster.tx, caster.ty, e.tx, e.ty) <= range + 0.5
    );
    if (candidates.length === 0) return null;
    candidates.sort(
      (a, b) =>
        distance(targetX, targetY, a.tx, a.ty) - distance(targetX, targetY, b.tx, b.ty)
    );
    return candidates[0];
  }

  /** 在射程内选取最接近目标瓦片的敌人（远程 / 减益） */
  _selectRangedTarget(caster, targetX, targetY, range) {
    const candidates = this._getEnemies(caster).filter(
      (e) => distance(caster.tx, caster.ty, e.tx, e.ty) <= range + 0.5
    );
    if (candidates.length === 0) return null;
    candidates.sort(
      (a, b) =>
        distance(targetX, targetY, a.tx, a.ty) - distance(targetX, targetY, b.tx, b.ty)
    );
    return candidates[0];
  }

  /** 治疗目标：优先目标瓦片附近的友方，否则自己 */
  _selectHealTarget(caster, targetX, targetY, range) {
    // 单玩家场景：目标在 caster 附近或就是自己
    if (this._isPlayer(caster) && this.scene && this.scene.player) {
      const p = this.scene.player;
      if (distance(caster.tx, caster.ty, p.tx, p.ty) <= range + 0.5) return p;
      return caster;
    }
    return caster;
  }

  /** 锥形（前方 ±45°）范围内的敌人 */
  _coneTargets(caster, facing, radius) {
    const dirSet = new Set([(facing + 7) % 8, facing, (facing + 1) % 8]);
    return this._getEnemies(caster).filter((e) => {
      const dx = e.tx - caster.tx;
      const dy = e.ty - caster.ty;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.1 || d > radius + 0.5) return false;
      return dirSet.has(this._dir8(dx, dy));
    });
  }

  /** 直线穿透（沿 facing）length 格内的敌人 */
  _lineTargets(caster, facing, length) {
    return this._getEnemies(caster).filter((e) => {
      const dx = e.tx - caster.tx;
      const dy = e.ty - caster.ty;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < 0.1 || d > length + 0.5) return false;
      return this._dir8(dx, dy) === facing;
    });
  }

  /** 沿 (dx,dy) 方向突进 maxSteps 格，遇到不可走则递减，返回可走落点 */
  _dashTile(caster, dx, dy, maxSteps) {
    for (let s = maxSteps; s >= 1; s--) {
      const nx = caster.tx + dx * s;
      const ny = caster.ty + dy * s;
      if (this._isWalkable(nx, ny)) return { tx: nx, ty: ny };
    }
    return { tx: caster.tx, ty: caster.ty };
  }

  /** 把目标推开 1 格（朝远离施法者方向瞬移） */
  _repel(caster, target, tiles) {
    if (!target) return;
    let dx = Math.sign(target.tx - caster.tx);
    let dy = Math.sign(target.ty - caster.ty);
    if (dx === 0 && dy === 0) { dx = 1; }
    const nx = target.tx + dx * tiles;
    const ny = target.ty + dy * tiles;
    if (this._isWalkable(nx, ny)) {
      target.tx = nx;
      target.ty = ny;
      const w = tileToWorld(nx, ny);
      target.wx = w.wx;
      target.wy = w.wy;
    }
  }

  /** 火墙 3 格长条：沿施法者→目标的主轴方向，中心在目标 */
  _lineTiles(caster, targetX, targetY, length) {
    const dx = targetX - caster.tx;
    const dy = targetY - caster.ty;
    const tiles = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      // 沿 Y 方向延伸（竖向长条，阻挡水平通路）
      const half = Math.floor((length - 1) / 2);
      for (let i = -half; i <= length - 1 - half; i++) {
        tiles.push({ tx: targetX, ty: targetY + i });
      }
    } else {
      const half = Math.floor((length - 1) / 2);
      for (let i = -half; i <= length - 1 - half; i++) {
        tiles.push({ tx: targetX + i, ty: targetY });
      }
    }
    return tiles;
  }

  /** 把目标瓦片限制在施法者 range 瓦片内 */
  _clampTarget(caster, tx, ty, range) {
    const dx = tx - caster.tx;
    const dy = ty - caster.ty;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= range) return { tx, ty };
    return {
      tx: Math.round(caster.tx + (dx / d) * range),
      ty: Math.round(caster.ty + (dy / d) * range),
    };
  }

  _isWalkable(tx, ty) {
    const map = this.scene && this.scene.map;
    if (!map) return true;
    if (map.inBounds && !map.inBounds(tx, ty)) return false;
    if (map.isWalkable && !map.isWalkable(tx, ty)) return false;
    return true;
  }

  /** 调用 combat.applyDamage 结算单体技能伤害（含 compute + 不死系加成） */
  _dealSkillDamage(caster, target, skill, skillLevel, type) {
    if (!target) return;
    let range = this._computeRange(caster, skill, skillLevel);
    const flags = skill.flags || {};
    if (flags.undeadBonus && target.family === 'undead') {
      range = { min: range.min * flags.undeadBonus, max: range.max * flags.undeadBonus };
    }
    const options = flags.ignoreDef ? { ignoreDef: flags.ignoreDef } : {};
    this._applyAndShow(caster, target, range, type, options);
  }

  /**
   * 伤害结算 + 飘字 + 受击特效
   * @param {object} attacker 施法者（可为 null）
   * @param {object} target 目标
   * @param {number|{min:number,max:number}} damage 伤害区间或数值
   * @param {string} type 伤害类型
   * @param {object} options 结算选项（ignoreDef 等）
   * @param {string} [textColor='#ffcc66'] 飘字颜色
   */
  _applyAndShow(attacker, target, damage, type, options, textColor = '#ffcc66') {
    if (!target || this._isDead(target)) return;
    const res = this._applyDamage(attacker, target, damage, type, options || {});
    if (!res) return;
    if (res.miss) {
      this.damageTexts.push(new DamageText(target.tx, target.ty, 'MISS', '#ffffff'));
    } else if (res.amount > 0) {
      this.damageTexts.push(
        new DamageText(target.tx, target.ty, `${Math.round(res.amount)}`, textColor, { crit: !!res.crit })
      );
      this._spawnEffect('hit', target.tx, target.ty);
    }
  }

  /**
   * 伤害结算（combat 优先，缺省走 fallback）
   * @returns {{amount:number, miss:boolean, crit:boolean}}
   */
  _applyDamage(attacker, target, damage, type, options) {
    if (this.combat && typeof this.combat.applyDamage === 'function') {
      const r = this.combat.applyDamage(attacker, target, damage, type, options);
      if (typeof r === 'number') return { amount: r, miss: false, crit: false };
      return r || { amount: 0, miss: true, crit: false };
    }
    // fallback：在区间内随机取整后直接 target.takeDamage
    let amt;
    if (typeof damage === 'number') amt = damage;
    else if (damage && typeof damage === 'object') {
      const lo = Math.floor(damage.min);
      const hi = Math.floor(damage.max);
      amt = hi >= lo ? randInt(lo, hi) : lo;
    } else {
      amt = 0;
    }
    if (amt > 0 && target && typeof target.takeDamage === 'function') {
      target.takeDamage(amt, type);
    }
    return { amount: amt, miss: false, crit: false };
  }

  /** 添加 buff（若目标支持 addBuff） */
  _addBuff(target, buff) {
    if (target && typeof target.addBuff === 'function') {
      target.addBuff(buff);
    }
  }

  /** 生成视觉特效并入队 */
  _spawnEffect(type, tx, ty, options) {
    this.effects.push(new Effect(type, tx, ty, options || {}));
  }
}

export default SkillSystem;
