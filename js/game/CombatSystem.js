/**
 * CombatSystem.js — 战斗结算系统
 *
 * 职责：
 * - playerAttack：玩家普攻怪物（物理伤害 + 武器耐久 -1 + 麻痹戒指特效）
 * - monsterAttack：怪物普攻玩家（按怪物 damageType 结算 + 玩家防具耐久 -1）
 * - applyDamage：通用伤害结算（命中 / 闪避 / 暴击 / 诅咒 / 防御减免）
 * - computeSkillDamage：技能伤害结算（computeDamage + 家族加成，如地狱雷光对不死系 1.5x）
 * - applyExp：经验结算（玩家等级比怪物高 10 级以上每级衰减 10%，下限 10%）
 *
 * 与 SkillSystem 的接口约定（Task 6 通过 scene.combat 引用调用）：
 *   combat.applyDamage(attacker, target, damage, type, options) -> {amount, miss, crit}
 *   - attacker：施法者（玩家 / 怪物 / 召唤物 / null 表示环境）
 *   - target：目标实体（需有 takeDamage）
 *   - damage：数值 或 {min,max} 区间
 *   - type：'physical' | 'magic' | 'poison' | 'fire' 等
 *   - options：{ ignoreDef?:number(0~1 忽略防御比例), alwaysHit?:boolean }
 *   - 返回 {amount, miss, crit}（amount=0 表示未命中或被完全吸收）
 *
 * 战斗公式（参考传奇原版）：
 * - 命中率 = clamp(0.8 + (命中 - 闪避) * 0.01, 0.05, 0.95)
 * - 暴击率 = clamp(幸运 * 0.01, 0, 0.95)，暴击伤害 ×1.5
 * - 诅咒率 = clamp(诅咒 * 0.01, 0, 0.95)，触发时伤害 ×0.7（-30%）
 * - 防御减免：physical→def，magic/poison/fire→mdef；ignoreDef 按比例无视
 * - 装备耐久：每次普攻武器 -1，每次被击随机防具 -1（耐久归零后属性失效并重算）
 *
 * 复用：
 * - utils/math.js 的 clamp / randInt
 * - data/items.js 的 getItem（麻痹戒指特效判定）
 * - data/skills.js 的 computeDamage（技能基础伤害区间）
 *
 * 目标鸭子类型：
 * - 玩家：stats / equipment / inventory / takeDamage(amount,type) / gainExp / recalculateStats
 * - 怪物：stats / monsterId / damageType / family / takeDamage(amount,type,attackerId) / addBuff
 */

import { clamp, randInt } from '../utils/math.js';
import { getItem } from '../data/items.js';
import { computeDamage } from '../data/skills.js';

/** 防具槽位（被击时随机损耗其一耐久，不含武器） */
const ARMOR_SLOTS = [
  'armor', 'helmet', 'necklace',
  'ringLeft', 'ringRight',
  'braceletLeft', 'braceletRight',
  'belt', 'boots',
];

export class CombatSystem {
  /**
   * @param {object} [scene] 所属场景引用（保留，便于未来扩展群体判定 / 安全区限制）
   */
  constructor(scene = null) {
    this.scene = scene;
  }

  // ===== 玩家普攻 =====

  /**
   * 玩家对目标发起普攻（物理）
   * - 武器耐久 -1
   * - 命中且目标存活时，检查麻痹戒指特效（概率眩晕目标）
   * @param {object} player 玩家
   * @param {object} target 目标（怪物）
   * @returns {{amount:number, miss:boolean, crit:boolean}}
   */
  playerAttack(player, target) {
    if (!player || !target) return { amount: 0, miss: true, crit: false };
    if (this._isDead(target)) return { amount: 0, miss: true, crit: false };

    // 武器耐久 -1（普攻）
    this._decrementSlot(player, 'weapon');

    const s = player.stats;
    const minAtk = s ? s.minAtk : 0;
    const maxAtk = s ? Math.max(s.minAtk, s.maxAtk) : 0;
    const result = this.applyDamage(player, target, { min: minAtk, max: maxAtk }, 'physical');

    // 麻痹戒指：命中且未致死时概率眩晕
    if (!result.miss && !this._isDead(target)) {
      this._maybeParalyze(player, target);
    }
    return result;
  }

  // ===== 怪物普攻 =====

  /**
   * 怪物对目标发起普攻
   * - 伤害类型取 monster.damageType（默认 physical）
   * - 玩家被击：随机防具耐久 -1
   * @param {object} monster 怪物
   * @param {object} target 目标（玩家 / 召唤物）
   * @returns {{amount:number, miss:boolean, crit:boolean}}
   */
  monsterAttack(monster, target) {
    if (!monster || !target) return { amount: 0, miss: true, crit: false };
    if (this._isDead(target)) return { amount: 0, miss: true, crit: false };

    const s = monster.stats;
    const minAtk = s ? s.minAtk : 0;
    const maxAtk = s ? Math.max(s.minAtk, s.maxAtk) : 0;
    const type = monster.damageType || 'physical';
    const result = this.applyDamage(monster, target, { min: minAtk, max: maxAtk }, type);

    // 玩家被击：随机防具耐久 -1
    if (!result.miss && !this._isDead(target) && target.equipment) {
      this._damageRandomArmor(target);
    }
    return result;
  }

  // ===== 通用伤害结算（SkillSystem 契约） =====

  /**
   * 通用伤害结算
   * @param {object|null} attacker 攻击者（null 表示环境伤害，跳过命中 / 暴击 / 诅咒）
   * @param {object} target 目标
   * @param {number|{min:number,max:number}} damage 伤害数值或区间
   * @param {string} [type='physical'] 伤害类型
   * @param {object} [options={}] { ignoreDef?:number, alwaysHit?:boolean }
   * @returns {{amount:number, miss:boolean, crit:boolean}}
   */
  applyDamage(attacker, target, damage, type = 'physical', options = {}) {
    if (!target || this._isDead(target)) return { amount: 0, miss: true, crit: false };

    // 1. 解析基础伤害为数值
    let baseDmg = this._resolveDamage(damage);
    if (baseDmg <= 0) return { amount: 0, miss: false, crit: false };

    const atkStats = attacker && attacker.stats ? attacker.stats : null;
    const tgtStats = target.stats ? target.stats : null;
    const skipHit = !!options.alwaysHit || type === 'poison'; // 毒系 DOT 必中

    // 2. 命中判定（环境伤害 / alwaysHit / 毒系跳过）
    if (!skipHit && attacker) {
      const hit = atkStats ? atkStats.hit : 0;
      const dodge = tgtStats ? tgtStats.dodge : 0;
      const hitRate = clamp(0.8 + (hit - dodge) * 0.01, 0.05, 0.95);
      if (Math.random() > hitRate) {
        return { amount: 0, miss: true, crit: false };
      }
    }

    let crit = false;
    // 3. 暴击判定（攻击者幸运）
    if (atkStats && atkStats.lucky > 0) {
      const critRate = clamp(atkStats.lucky * 0.01, 0, 0.95);
      if (Math.random() < critRate) {
        crit = true;
        baseDmg = Math.floor(baseDmg * 1.5);
      }
    }

    // 4. 诅咒判定（攻击者诅咒，触发时自身伤害 -30%）
    if (atkStats && atkStats.curse > 0) {
      const curseRate = clamp(atkStats.curse * 0.01, 0, 0.95);
      if (Math.random() < curseRate) {
        baseDmg = Math.floor(baseDmg * 0.7);
      }
    }

    // 5. 防御减免（physical→def，其它→mdef；ignoreDef 按比例无视）
    const ignoreDef = clamp(options.ignoreDef || 0, 0, 1);
    let def = 0;
    if (type === 'physical') {
      def = tgtStats ? tgtStats.def : 0;
    } else {
      def = tgtStats ? tgtStats.mdef : 0;
    }
    const effectiveDef = def * (1 - ignoreDef);
    const finalDmg = Math.max(0, Math.floor(baseDmg - effectiveDef));

    // 6. 应用到目标
    if (finalDmg > 0 && typeof target.takeDamage === 'function') {
      const attackerId = attacker && attacker.id != null ? attacker.id : null;
      // Monster.takeDamage(amount, type, attackerId)；Player.takeDamage(amount, type) 多余参数被忽略
      target.takeDamage(finalDmg, type, attackerId);
    }

    return { amount: finalDmg, miss: false, crit };
  }

  // ===== 技能伤害结算 =====

  /**
   * 技能伤害结算：computeDamage 计算基础区间 + 家族加成，再走 applyDamage
   * - 如技能 flags.undeadBonus 且目标 family==='undead'，伤害区间乘以加成倍率
   * - 如技能 flags.ignoreDef，按比例无视防御
   * @param {object} attacker 施法者
   * @param {object} target 目标
   * @param {object} skill 技能定义
   * @param {number} skillLevel 技能等级
   * @param {string} [type] 伤害类型（缺省取 skill.damageType）
   * @returns {{amount:number, miss:boolean, crit:boolean}}
   */
  computeSkillDamage(attacker, target, skill, skillLevel, type) {
    if (!skill || !target) return { amount: 0, miss: true, crit: false };
    const casterView = this._casterView(attacker, skillLevel);
    let range = computeDamage(skill, casterView, target);
    if (!range) return { amount: 0, miss: false, crit: false };

    // 家族加成（如地狱雷光对不死系 1.5x）
    const flags = skill.flags || {};
    if (flags.undeadBonus && target && target.family === 'undead') {
      range = {
        min: range.min * flags.undeadBonus,
        max: range.max * flags.undeadBonus,
      };
    }

    const options = flags.ignoreDef ? { ignoreDef: flags.ignoreDef } : {};
    const dmgType = type || skill.damageType || 'physical';
    return this.applyDamage(attacker, target, range, dmgType, options);
  }

  // ===== 经验结算 =====

  /**
   * 给玩家结算击杀怪物经验
   * - 玩家等级比怪物高 10 级以上：每超出 1 级衰减 10%，下限 10%
   * @param {object} player 玩家
   * @param {object} monster 怪物
   * @returns {number} 实际获得经验
   */
  applyExp(player, monster) {
    if (!player || !monster) return 0;
    let exp = monster.exp || (monster.stats && monster.stats.exp) || 0;
    if (exp <= 0) return 0;

    const over = (player.level || 1) - (monster.level || 1) - 10;
    if (over > 0) {
      exp = Math.max(exp * 0.1, exp * (1 - 0.1 * over));
    }
    const finalExp = Math.floor(exp);
    if (finalExp > 0 && typeof player.gainExp === 'function') {
      player.gainExp(finalExp);
    }
    return finalExp;
  }

  // ===== 内部辅助 =====

  /** 伤害数值 / 区间 → 整数 */
  _resolveDamage(damage) {
    if (typeof damage === 'number') return Math.floor(damage);
    if (damage && typeof damage === 'object') {
      const lo = Math.floor(damage.min);
      const hi = Math.floor(damage.max);
      return hi >= lo ? randInt(lo, hi) : lo;
    }
    return 0;
  }

  /** 构造 computeDamage 所需的施法者视图 */
  _casterView(attacker, skillLevel) {
    const s = (attacker && attacker.stats) || {};
    return {
      skillLevel: skillLevel || 1,
      minAtk: s.minAtk || 0,
      maxAtk: s.maxAtk || 0,
      minMatk: s.minMatk || 0,
      maxMatk: s.maxMatk || 0,
    };
  }

  /** 单位是否已死亡 / 失效 */
  _isDead(e) {
    if (!e) return true;
    if (e.state === 'dead' || e.dead === true || e.alive === false) return true;
    if (e.stats && e.stats.hp != null && e.stats.hp <= 0) return true;
    return false;
  }

  /**
   * 指定槽位装备耐久 -1
   * - 耐久归零时标记 equipment.dirty 并重算属性（移除失效装备加成）
   * @param {object} player 玩家
   * @param {string} slot 装备槽
   */
  _decrementSlot(player, slot) {
    const eq = player.equipment;
    if (!eq) return;
    const s = eq.getSlot(slot);
    if (!s || s.durability <= 0) return;
    s.durability -= 1;
    if (s.durability <= 0) {
      s.durability = 0;
      eq.dirty = true;
      if (typeof player.recalculateStats === 'function') player.recalculateStats();
    }
  }

  /** 随机损耗一件已穿戴防具耐久 -1 */
  _damageRandomArmor(player) {
    const eq = player.equipment;
    if (!eq) return;
    const equipped = [];
    for (const slot of ARMOR_SLOTS) {
      const s = eq.getSlot(slot);
      if (s && s.durability > 0) equipped.push(slot);
    }
    if (equipped.length === 0) return;
    const slot = equipped[Math.floor(Math.random() * equipped.length)];
    this._decrementSlot(player, slot);
  }

  /**
   * 麻痹戒指特效：命中后按 specialChance 概率眩晕目标
   * - 怪物走 addBuff({effect:'stun'}) 通路（与 Monster._hasBuff('stun') 判定一致）
   * - 无 addBuff 的目标直接设置 state='stunned'
   * @param {object} player 玩家
   * @param {object} target 目标
   */
  _maybeParalyze(player, target) {
    const eq = player.equipment;
    if (!eq) return;
    const slots = ['ringLeft', 'ringRight'];
    for (const slot of slots) {
      const s = eq.getSlot(slot);
      if (!s || s.durability <= 0) continue;
      const def = getItem(s.itemId);
      if (!def || def.special !== 'paralyze_on_hit') continue;
      const chance = def.specialChance || 0;
      if (chance <= 0 || Math.random() >= chance) continue;
      const durationSec = def.specialDuration || 1;
      // 怪物走 addBuff 通路（兼容 _hasBuff('stun')）
      if (typeof target.addBuff === 'function') {
        target.addBuff({
          id: 'stun',
          effect: 'stun',
          duration: durationSec,
          remainingMs: durationSec * 1000,
        });
      } else if (target.state !== undefined) {
        target.state = 'stunned';
      }
      return; // 仅触发一次
    }
  }
}

export default CombatSystem;
