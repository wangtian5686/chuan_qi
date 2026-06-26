/**
 * PkSystem.js — PK 与红名系统
 *
 * 职责：
 * - 记录玩家攻击 / 击杀行为，按规则增减 PK 值
 * - 判定攻击合法性（安全区 / 红名 / 正当反击）
 * - 在线时间衰减 PK 值（每 60 秒 -1）
 * - 协调守卫对红名玩家的执法
 * - 提供名字颜色 / PK 状态查询
 *
 * 复用：
 * - Player / Monster / Guard（鸭子类型判定，避免循环依赖）
 * - IsometricMap.isInSafeZone（通过 map 引用）
 * - DropItem（玩家死亡掉落装备）
 * - data/items.js 的 getItem（判定装备绑定）
 *
 * 集成约定：
 * - 由 CombatSystem 在攻击 / 击杀时通过 game.pkSystem 引用调用：
 *     game.pkSystem.canAttack(attacker, target)
 *     game.pkSystem.onAttack(attacker, target, isKill)
 *     game.pkSystem.onKill(killer, victim)
 * - 由 Game 主循环每帧调用 update(dt, game) 做 PK 衰减与守卫协调
 *
 * PK 值阈值：
 * - < 3：白名
 * - 3 ~ 7：黄名
 * - > 7：红名
 * - > 50：深红（恶人）
 */

import { DropItem } from './DropItem.js';
import { getItem } from '../data/items.js';

/** 等距瓦片像素尺寸（与 IsometricMap / Player 一致） */
const TILE_W = 64;
const TILE_H = 32;

/** PK 在线衰减间隔（毫秒）：每 60 秒衰减 1 点 */
const PK_DECAY_INTERVAL_MS = 60 * 1000;
/** 每次衰减点数 */
const PK_DECAY_AMOUNT = 1;
/** 正当反击判定窗口（毫秒）：被攻击后多久内反击算正当 */
const COUNTER_ATTACK_WINDOW_MS = 10 * 1000;

/**
 * 瓦片坐标 -> 世界像素坐标（瓦片中心）
 * 与 IsometricMap.tileToWorld 公式一致，避免对地图实例的硬依赖。
 */
function tileToWorld(tx, ty) {
  return {
    wx: (tx - ty) * (TILE_W / 2),
    wy: (tx + ty) * (TILE_H / 2),
  };
}

export class PkSystem {
  /**
   * @param {object} scene Scene 实例（提供 player / npcs / map / addEntity）
   * @param {object} map IsometricMap 实例（提供 isInSafeZone）
   * @param {object} game Game 上下文（保留引用）
   */
  constructor(scene, map, game) {
    this.scene = scene;
    this.map = map;
    this.game = game;
    /** 最近攻击记录：attackerId -> {targetId, timestamp}，用于判定"主动攻击 / 正当反击" */
    this.recentAttacks = new Map();
    /** PK 衰减累计毫秒 */
    this._decayAccumMs = 0;
  }

  // ===== 类型判定（鸭子类型，避免循环依赖） =====

  /** 是否为玩家（Player 有 classId 与 equipment） */
  _isPlayer(e) {
    return !!(e && typeof e.classId === 'string' && e.equipment);
  }

  /** 是否为怪物（Monster 有 monsterId） */
  _isMonster(e) {
    return !!(e && typeof e.monsterId === 'string');
  }

  /** 是否为守卫（Guard 标记 isGuard === true） */
  _isGuard(e) {
    return !!(e && e.isGuard === true);
  }

  // ===== 攻击 / 击杀钩子 =====

  /**
   * 攻击事件钩子（由 CombatSystem 在每次攻击时调用）
   * - 玩家主动攻击其他玩家 / 守卫（非怪物）：不增加 PK 值，但记录 recentAttacks
   * - 玩家击杀其他玩家：attacker.pkValue += 100（杀人加大量 PK 值）
   * - 玩家击杀守卫：attacker.pkValue += 50
   * - 玩家击杀怪物：不影响 PK 值
   * @param {object} attacker 攻击者
   * @param {object} target 目标
   * @param {boolean} isKill 是否为击杀（致死一击）
   */
  onAttack(attacker, target, isKill) {
    if (!attacker || !target) return;
    // 仅玩家攻击者参与 PK 计分与记录
    if (!this._isPlayer(attacker)) return;

    // 玩家攻击玩家 / 守卫（非怪物）：记录最近攻击，用于正当反击判定
    if (this._isPlayer(target) || this._isGuard(target)) {
      if (attacker.id != null) {
        this.recentAttacks.set(attacker.id, {
          targetId: target.id != null ? target.id : null,
          timestamp: Date.now(),
        });
      }
    }

    // 仅击杀才计 PK 值
    if (!isKill) return;

    if (this._isPlayer(target)) {
      attacker.pkValue += 100; // 杀人加大量 PK 值
    } else if (this._isGuard(target)) {
      attacker.pkValue += 50; // 杀守卫
    }
    // 击杀怪物：无 PK 影响
  }

  /**
   * 击杀事件钩子（由 CombatSystem 在目标死亡时调用）
   * - 调用 onAttack(killer, victim, true) 结算 PK 值
   * - 玩家受害者：死亡掉落身上随机一件非绑定装备
   * - 守卫受害者：killer 增加 PK 值（已在 onAttack 中处理）
   * - 怪物受害者：无 PK 影响
   * @param {object} killer 击杀者
   * @param {object} victim 受害者
   */
  onKill(killer, victim) {
    this.onAttack(killer, victim, true);
    if (this._isPlayer(victim)) {
      this._dropRandomEquipment(victim);
    }
  }

  /**
   * 玩家死亡掉落身上随机一件非绑定装备
   * - 遍历已穿戴装备，过滤绑定物品（item.bound === true）
   * - 随机卸下一件，生成 DropItem 加入 scene.drops
   * - 卸下后重算受害者属性
   * @param {object} victim 玩家受害者
   */
  _dropRandomEquipment(victim) {
    if (!victim || !victim.equipment) return;
    const eq = victim.equipment;
    const slots = [];
    eq.forEachEquipped((slot, item) => {
      const def = getItem(item.itemId);
      if (def && def.bound) return; // 绑定装备不掉落
      slots.push(slot);
    });
    if (slots.length === 0) return;

    const slot = slots[Math.floor(Math.random() * slots.length)];
    const removed = eq.unequip(slot);
    if (!removed) return;
    if (typeof victim.recalculateStats === 'function') victim.recalculateStats();

    const scene = this.scene;
    if (!scene || typeof scene.addEntity !== 'function') return;
    const mapId = scene.map && scene.map.id;
    const drop = new DropItem(
      removed.itemId, 1, victim.tx, victim.ty, mapId, null, removed.durability,
    );
    const w = tileToWorld(victim.tx, victim.ty);
    drop.wx = w.wx;
    drop.wy = w.wy;
    scene.addEntity('drop', drop);
  }

  // ===== 名字颜色 / 状态查询 =====

  /**
   * 按 PK 值返回名字颜色
   * - < 3：白名 '#ffffff'
   * - 3 ~ 7：黄名 '#ffff00'
   * - > 7：红名 '#ff0000'
   * - > 50：深红（恶人） '#8B0000'
   * @param {number} pkValue
   * @returns {string}
   */
  getNameColor(pkValue) {
    if (pkValue > 50) return '#8B0000'; // 深红，恶人
    if (pkValue > 7) return '#ff0000'; // 红名
    if (pkValue >= 3) return '#ffff00'; // 黄名
    return '#ffffff'; // 白名
  }

  /** 是否红名（pkValue > 7） */
  isRedName(pkValue) {
    return pkValue > 7;
  }

  /**
   * 获取玩家 PK 状态汇总
   * @param {object} player
   * @returns {{color:string, level:'white'|'yellow'|'red'|'darkred', pkValue:number}}
   */
  getPkState(player) {
    const pk = (player && player.pkValue) || 0;
    let level;
    if (pk > 50) level = 'darkred';
    else if (pk > 7) level = 'red';
    else if (pk >= 3) level = 'yellow';
    else level = 'white';
    return { color: this.getNameColor(pk), level, pkValue: pk };
  }

  // ===== 安全区 / 攻击合法性 =====

  /**
   * 瓦片是否在安全区内（委托 map.isInSafeZone）
   * @param {number} tx
   * @param {number} ty
   * @returns {boolean}
   */
  isInSafeZone(tx, ty) {
    return this.map && typeof this.map.isInSafeZone === 'function'
      ? this.map.isInSafeZone(tx, ty)
      : false;
  }

  /**
   * 判定攻击是否合法
   * 规则：
   * - 安全区内禁止任何攻击（守卫执法除外）
   * - 红名玩家可被任何人攻击（无安全区保护）
   * - 白名玩家只能攻击：红名玩家、怪物、守卫、被攻击反击
   * - 守卫可攻击红名玩家
   * @param {object} attacker
   * @param {object} target
   * @returns {{allowed:boolean, reason:string}}
   */
  canAttack(attacker, target) {
    if (!attacker || !target) return { allowed: false, reason: '无效目标' };

    const atkInSafe = this.isInSafeZone(attacker.tx, attacker.ty);
    const tgtInSafe = this.isInSafeZone(target.tx, target.ty);
    const tgtIsRedPlayer = this._isPlayer(target) && this.isRedName(target.pkValue);

    // 守卫执法：守卫攻击红名玩家始终允许（含安全区内，守卫在城镇执法）
    if (this._isGuard(attacker) && this._isPlayer(target)) {
      if (tgtIsRedPlayer) return { allowed: true, reason: '守卫执法' };
      return { allowed: false, reason: '守卫仅攻击红名玩家' };
    }

    // 攻击者位于安全区：禁止攻击
    if (atkInSafe) return { allowed: false, reason: '安全区内禁止攻击' };
    // 目标位于安全区受保护（红名玩家无安全区保护，可被攻击）
    if (tgtInSafe && !tgtIsRedPlayer) return { allowed: false, reason: '目标在安全区内' };

    // 玩家攻击规则
    if (this._isPlayer(attacker)) {
      if (this._isMonster(target)) return { allowed: true, reason: '' };
      if (this._isGuard(target)) return { allowed: true, reason: '' };
      if (this._isPlayer(target)) {
        if (tgtIsRedPlayer) return { allowed: true, reason: '攻击红名玩家' };
        if (this._wasAttackedBy(target, attacker)) return { allowed: true, reason: '正当反击' };
        return { allowed: false, reason: '不可主动攻击白名玩家' };
      }
    }

    // 怪物攻击玩家：允许（由怪物 AI 控制）
    if (this._isMonster(attacker) && this._isPlayer(target)) {
      return { allowed: true, reason: '' };
    }

    return { allowed: false, reason: '不允许' };
  }

  /**
   * target 是否在反击窗口内攻击过 attacker（正当反击判定）
   * @param {object} target 被攻击者（查询其是否曾主动攻击 attacker）
   * @param {object} attacker 当前攻击者
   * @returns {boolean}
   */
  _wasAttackedBy(target, attacker) {
    if (!target || !attacker || target.id == null || attacker.id == null) return false;
    const rec = this.recentAttacks.get(target.id);
    if (!rec || rec.targetId !== attacker.id) return false;
    return (Date.now() - rec.timestamp) <= COUNTER_ATTACK_WINDOW_MS;
  }

  // ===== 赎罪药水 =====

  /**
   * 减少玩家 PK 值（用于赎罪药水）
   * @param {object} player
   * @param {number} amount
   */
  reducePk(player, amount) {
    if (!player) return;
    player.pkValue = Math.max(0, player.pkValue - amount);
  }

  // ===== 每帧更新 =====

  /**
   * @param {number} dt 帧间隔（秒）
   * @param {object} [game] Game 上下文
   */
  update(dt, game) {
    if (game) this.game = game;

    // 1. 在线时间衰减 PK 值（每 60 秒 -1，PK > 0 时）
    this._decayAccumMs += dt * 1000;
    if (this._decayAccumMs >= PK_DECAY_INTERVAL_MS) {
      this._decayAccumMs -= PK_DECAY_INTERVAL_MS;
      this._decayOnlinePlayers(PK_DECAY_AMOUNT);
    }

    // 2. 守卫检测红名玩家：8 格内有 pkValue > 7 的玩家，守卫进入攻击状态
    this._guardsCheckRedName();
  }

  /** 衰减所有在线玩家的 PK 值（PK > 0 时） */
  _decayOnlinePlayers(amount) {
    const scene = this.scene;
    if (!scene) return;
    const p = scene.player;
    if (p && p.pkValue > 0) {
      p.pkValue = Math.max(0, p.pkValue - amount);
    }
  }

  /**
   * 扫描 scene 中守卫类 NPC，若 8 格内有 pkValue > 7 的玩家，
   * 令守卫进入追击状态（与 Guard.update 自身扫描互补，幂等）
   */
  _guardsCheckRedName() {
    const scene = this.scene;
    if (!scene || !Array.isArray(scene.npcs)) return;
    const player = scene.player;
    if (!player) return;
    const playerRed = this.isRedName(player.pkValue);

    for (const npc of scene.npcs) {
      if (!npc || !npc.isGuard) continue;
      const vision = (npc.stats && npc.stats.visionRange) || 8;
      const dx = (player.tx || 0) - (npc.tx || 0);
      const dy = (player.ty || 0) - (npc.ty || 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (playerRed && player.state !== 'dead' && dist <= vision) {
        // 守卫进入攻击状态
        if (npc.state === 'idle') {
          npc.state = 'chase';
          npc.target = player;
        }
      }
    }
  }
}

export default PkSystem;
