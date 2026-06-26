/**
 * Player.js — 玩家角色实体
 *
 * 职责：
 * - 维护玩家全部状态：职业 / 等级 / 经验 / 属性 / 装备 / 背包 / 技能 / buff / 坐标 / 朝向 / 状态机
 * - 属性重算（recalculateStats）：职业基础 + 装备 + buff + 套装加成，并保留当前 hp/mp 比例
 * - 升级 / 学技 / 施法 / 受击 / 治疗 / buff 管理
 * - 寻路移动（setDestination + update 状态机沿 path 行进，8 方向 facing）
 * - 渲染信息输出（getRenderInfo）与序列化 / 反序列化
 *
 * 复用：
 * - Equipment / Inventory（前序任务创建，本类只调用其接口，不重新定义）
 * - classes.js / skills.js / items.js 数据表
 * - Pathfinder.findPath / simplifyPath 做寻路
 * - SpriteRenderer 静态方法做绘制（实际绘制由 Scene / 测试入口调用）
 *
 * 坐标约定：
 * - 等距瓦片宽 64 高 32（TILE_W / TILE_H）
 * - tileToWorld 与 IsometricMap.tileToWorld 公式一致：
 *     wx = (tx - ty) * (TILE_W / 2)
 *     wy = (tx + ty) * (TILE_H / 2)
 * - 移动速度：每秒 stats.moveSpeed 个瓦片，按瓦片中心欧氏距离换算像素/秒，
 *   以"瓦片对角线长度" sqrt(TILE_W² + TILE_H²) 作为 1 瓦片距离单位。
 */

import { Stats } from './Stats.js';
import { Equipment } from './Equipment.js';
import { Inventory } from './Inventory.js';
import { getClass } from '../data/classes.js';
import { getSkill } from '../data/skills.js';
import { getItem, applyItemStats, checkSetBonus } from '../data/items.js';
import { Pathfinder } from '../engine/Pathfinder.js';
import { angleBetween } from '../utils/math.js';

/** 等距瓦片像素尺寸（与 IsometricMap 一致） */
const TILE_W = 64;
const TILE_H = 32;
/** 瓦片对角线长度（像素），作为 1 瓦片距离单位，用于换算移动速度 */
const TILE_DIAGONAL = Math.sqrt(TILE_W * TILE_W + TILE_H * TILE_H);

/** 职业无图占位色（与 main.js 占位精灵色一致） */
const CLASS_COLORS = {
  warrior: '#c8902a',
  mage: '#3a7bd5',
  taoist: '#3aa860',
};

/** 全局自增玩家 id 计数器（便于 DropItem owner 绑定） */
let _nextPlayerId = 1;

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
 * 由位移向量 (dx,dy) 计算 8 方向 facing
 * facing：0=下，1=左下，2=左，3=左上，4=上，5=右上，6=右，7=右下（顺时针）
 * 用 atan2(dy, dx) 计算，分 8 个区间（每 45°一档）。
 */
function dirToFacing(dx, dy) {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return 0; // 默认朝下
  // angleBetween(0,0,dx,dy) = atan2(dy, dx)，范围 [-PI, PI]
  let a = angleBetween(0, 0, dx, dy);
  if (a < 0) a += Math.PI * 2; // 标准化到 [0, 2PI)
  // 0=右 -> facing 6；每 45° 档位，偏移 6 后对 8 取模
  return (Math.round(a / (Math.PI / 4)) + 6) % 8;
}

export class Player {
  /**
   * @param {string} classId 职业 ID（'warrior'/'mage'/'taoist'）
   * @param {string} name 角色名
   * @param {object} mapData 地图数据（用于取 playerStart 默认起点；不强制为 IsometricMap 实例）
   * @param {object} [options={}]
   * @param {number} [options.tx] 初始瓦片 X（缺省取 mapData.playerStart.x）
   * @param {number} [options.ty] 初始瓦片 Y
   * @param {number} [options.level=1] 初始等级
   */
  constructor(classId, name, mapData, options = {}) {
    /** 唯一 id（自增整数，便于 DropItem owner 绑定） */
    this.id = _nextPlayerId++;
    this.name = name;
    this.classId = classId;
    /** 地图数据引用（仅供取起点 / 元信息，不做寻路） */
    this.mapData = mapData;

    // ===== 等级 / 经验 =====
    this.level = options.level || 1;
    this.exp = 0;

    // ===== 属性 / 装备 / 背包 =====
    /** @type {Stats|null} 初始为 null，由 recalculateStats 首次填充为满血满蓝 */
    this.stats = null;
    /** @type {Equipment} */
    this.equipment = new Equipment();
    /** @type {Inventory} */
    this.inventory = new Inventory();

    // ===== 技能 =====
    /** 已学技能：skillId -> skillLevel */
    this.skills = new Map();
    /** 快捷栏 F1-F8：8 个 skillId | null */
    this.hotbar = new Array(8).fill(null);
    /** 技能冷却：skillId -> 剩余毫秒 */
    this.cooldowns = new Map();

    // ===== buff =====
    /** @type {Array<{id,stats?,effect?,value,duration,remainingMs,source}>} */
    this.buffs = [];

    // ===== PK / 经济 =====
    this.pkValue = 0;
    this.gold = 0;

    // ===== 召唤物 =====
    /** 已召唤物 id 列表（由后续 SkillSystem 维护） */
    this.summonIds = [];

    // ===== 战斗回调（由后续战斗系统注入） =====
    /** @type {(player:Player, target:object)=>void} */
    this.onAttack = null;
    /** @type {(player:Player, skill:object, targetX:number, targetY:number)=>void} */
    this.onCastSkill = null;

    // ===== 坐标 / 朝向 / 状态 =====
    const startTx = options.tx != null
      ? options.tx
      : (mapData && mapData.playerStart ? mapData.playerStart.x : 0);
    const startTy = options.ty != null
      ? options.ty
      : (mapData && mapData.playerStart ? mapData.playerStart.y : 0);
    this.tx = startTx;
    this.ty = startTy;
    const sw = tileToWorld(this.tx, this.ty);
    this.wx = sw.wx;
    this.wy = sw.wy;
    /** 朝向：0=下 1=左下 2=左 3=左上 4=上 5=右上 6=右 7=右下 */
    this.facing = 0;
    /** 状态机：'idle'|'moving'|'attacking'|'casting'|'dead' */
    this.state = 'idle';
    /** 当前寻路路径（path[0] 为下一格目标瓦片） */
    this.path = [];
    /** 攻击目标引用（怪物 / NPC / 位置，可选） */
    this.target = null;
    /** 普攻冷却剩余毫秒 */
    this.attackCooldownMs = 0;

    // 初始属性重算（满血满蓝）
    this.recalculateStats();
  }

  // ===== 属性重算 =====

  /**
   * 重新计算总属性：
   * 1. stats = Stats.fromClassLevel(classId, level)
   * 2. 叠加装备属性（耐久 > 0 才生效）
   * 3. 叠加 buff 属性
   * 4. 叠加套装加成
   * 5. 保留当前 hp/mp 比例：newHp = min(oldHp, newMaxHp)
   * 6. equipment.dirty = false
   *
   * 说明：装备的 +hp / +mp 加成体现为 maxHp / maxMp 提升。fromClassLevel 令 hp=maxHp，
   * 叠加 +hp 后 hp 自然等于"新上限"，故 newMaxHp 取叠加后的 hp，再把当前 hp 还原。
   */
  recalculateStats() {
    const oldHp = this.stats ? this.stats.hp : undefined;
    const oldMp = this.stats ? this.stats.mp : undefined;

    // 1. 职业基础属性
    const s = Stats.fromClassLevel(this.classId, this.level);

    // 2. 装备属性（耐久 > 0 才生效）
    this.equipment.forEachEquipped((slot, { itemId, durability }) => {
      if (durability > 0) {
        const item = getItem(itemId);
        if (item && item.stats) applyItemStats(s, item);
      }
    });

    // 3. buff 属性
    for (const buff of this.buffs) s.applyBuff(buff);

    // 4. 套装加成
    const bonuses = checkSetBonus(this.equipment.getEquippedItemIds());
    for (const { bonus } of bonuses) s.add(bonus);

    // 5. 保留当前 hp / mp 比例
    //    叠加后 s.hp = 基础上限 + 装备/buff/套装的 +hp 加成 = 新 maxHp
    const newMaxHp = s.hp;
    const newMaxMp = s.mp;
    s.maxHp = newMaxHp;
    s.maxMp = newMaxMp;
    s.hp = oldHp === undefined ? newMaxHp : Math.min(oldHp, newMaxHp);
    s.mp = oldMp === undefined ? newMaxMp : Math.min(oldMp, newMaxMp);
    if (s.hp < 0) s.hp = 0;
    if (s.mp < 0) s.mp = 0;

    this.stats = s;

    // 6. 清除装备脏标记
    this.equipment.dirty = false;
  }

  // ===== 经验 / 升级 =====

  /**
   * 升级所需经验：level * level * 100
   * @returns {number}
   */
  getExpToNext() {
    return this.level * this.level * 100;
  }

  /**
   * 获得经验，循环检查升级
   * @param {number} amount 经验量
   * @returns {{leveledUp:boolean, newLevel:number}}
   */
  gainExp(amount) {
    this.exp += amount;
    let leveledUp = false;
    while (this.exp >= this.getExpToNext()) {
      this.exp -= this.getExpToNext(); // 扣除本级所需经验
      this.level++;
      leveledUp = true;
      this.recalculateStats();
      // 升级回满 hp / mp
      this.stats.hp = this.stats.maxHp;
      this.stats.mp = this.stats.maxMp;
    }
    return { leveledUp, newLevel: this.level };
  }

  // ===== 技能 =====

  /**
   * 学习 / 提升技能
   * - 检查职业可学列表（CLASSES[classId].learnableSkills）含该 skillId
   * - 检查等级 >= 学习等级
   * - 已学则提升等级（上限 3），未学则加入 skills Map（等级 1）
   * @param {string} skillId 技能 ID
   * @returns {boolean} 是否学习 / 提升成功
   */
  learnSkill(skillId) {
    const cls = getClass(this.classId);
    if (!cls || !cls.learnableSkills) return false;
    const entry = cls.learnableSkills.find((e) => e.skillId === skillId);
    if (!entry) return false; // 职业不可学
    if (this.level < entry.level) return false; // 等级不足
    if (this.skills.has(skillId)) {
      const cur = this.skills.get(skillId);
      if (cur < 3) this.skills.set(skillId, cur + 1);
    } else {
      this.skills.set(skillId, 1);
    }
    return true;
  }

  /**
   * 是否可施放技能
   * @param {string} skillId 技能 ID
   * @returns {{ok:boolean, reason:string}}
   */
  canCastSkill(skillId) {
    const skill = getSkill(skillId);
    if (!skill) return { ok: false, reason: '技能不存在' };
    if (!this.skills.has(skillId)) return { ok: false, reason: '未学习该技能' };
    // 等级是否满足学习等级
    const cls = getClass(this.classId);
    const learnable = cls && cls.learnableSkills
      ? cls.learnableSkills.find((e) => e.skillId === skillId)
      : null;
    if (learnable && this.level < learnable.level) {
      return { ok: false, reason: '等级不足' };
    }
    if (this.stats.mp < (skill.mpCost || 0)) return { ok: false, reason: '魔法不足' };
    if (this.cooldowns.has(skillId)) return { ok: false, reason: '冷却中' };
    return { ok: true, reason: '' };
  }

  /**
   * 施放技能：校验 -> 扣 MP -> 进冷却 -> state='casting' -> 调用 onCastSkill 回调
   * 注意：本方法只做校验与状态切换，具体技能效果由后续 SkillSystem 通过回调实现。
   * @param {string} skillId 技能 ID
   * @param {number} targetX 目标瓦片 X
   * @param {number} targetY 目标瓦片 Y
   * @returns {{ok:boolean, reason:string, skill?:object}}
   */
  castSkill(skillId, targetX, targetY) {
    const check = this.canCastSkill(skillId);
    if (!check.ok) return { ok: false, reason: check.reason };
    const skill = getSkill(skillId);
    // 扣 MP
    this.stats.mp -= skill.mpCost || 0;
    if (this.stats.mp < 0) this.stats.mp = 0;
    // 进冷却
    if (skill.cooldown > 0) this.cooldowns.set(skillId, skill.cooldown * 1000);
    // 切换状态（castTime 在回调中由 SkillSystem 处理，此处简化为立即完成）
    this.state = 'casting';
    // 调用回调
    if (typeof this.onCastSkill === 'function') {
      this.onCastSkill(this, skill, targetX, targetY);
    }
    return { ok: true, reason: '', skill };
  }

  // ===== 生命 / 治疗 =====

  /**
   * 受到伤害
   * - 魔法盾优先吸收由 buff 处理（本任务不实现，留给后续 SkillSystem）
   * - hp <= 0 时 state='dead'
   * @param {number} amount 伤害量
   * @param {string} [type='physical'] 伤害类型
   */
  takeDamage(amount, type = 'physical') {
    if (this.state === 'dead') return;
    let dmg = Math.max(0, amount);
    // 魔法盾 buff 吸收：优先从 absorb 池扣减，池归零后移除 buff
    if (dmg > 0) {
      const shield = this.buffs.find((b) => b.id === 'magic_shield' && b.absorb > 0);
      if (shield) {
        const absorbed = Math.min(dmg, shield.absorb);
        shield.absorb -= absorbed;
        dmg -= absorbed;
        if (shield.absorb <= 0) this.removeBuff('magic_shield');
      }
    }
    this.stats.hp -= dmg;
    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
      this.state = 'dead';
      this.path = [];
      this.target = null;
    }
  }

  /** 治疗 HP（不超过上限） */
  heal(amount) {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  /** 恢复 MP（不超过上限） */
  healMp(amount) {
    this.stats.mp = Math.min(this.stats.maxMp, this.stats.mp + amount);
  }

  // ===== buff =====

  /**
   * 添加 buff（同 id 刷新，不同 id 追加），并重算属性
   * @param {object} buff buff 对象
   */
  addBuff(buff) {
    const idx = this.buffs.findIndex((b) => b.id === buff.id);
    if (idx >= 0) this.buffs[idx] = buff;
    else this.buffs.push(buff);
    if (!buff.remainingMs) buff.remainingMs = (buff.duration || 0) * 1000;
    this.recalculateStats();
  }

  /**
   * 移除指定 id 的 buff，并重算属性
   * @param {string} buffId buff ID
   */
  removeBuff(buffId) {
    const idx = this.buffs.findIndex((b) => b.id === buffId);
    if (idx >= 0) {
      this.buffs.splice(idx, 1);
      this.recalculateStats();
    }
  }

  /** 是否拥有指定 id 的 buff */
  hasBuff(buffId) {
    return this.buffs.some((b) => b.id === buffId);
  }

  /**
   * 更新 buff 剩余时间，过期移除并重算属性
   * @param {number} dt 帧间隔（秒）
   */
  updateBuffs(dt) {
    if (this.buffs.length === 0) return;
    let changed = false;
    const deltaMs = dt * 1000;
    for (let i = this.buffs.length - 1; i >= 0; i--) {
      const b = this.buffs[i];
      b.remainingMs -= deltaMs;
      if (b.remainingMs <= 0) {
        this.buffs.splice(i, 1);
        changed = true;
      }
    }
    if (changed) this.recalculateStats();
  }

  // ===== 移动 / 寻路 =====

  /**
   * 设置寻路目标
   * - 用 Pathfinder.findPath 从当前瓦片寻路到目标瓦片
   * - 简化路径，去掉起点（当前瓦片），令 path[0] 为下一格目标
   * - 切换 state='moving'
   * @param {number} targetTx 目标瓦片 X
   * @param {number} targetTy 目标瓦片 Y
   * @param {object} map IsometricMap 实例（提供 isWalkable / inBounds）
   */
  setDestination(targetTx, targetTy, map) {
    if (!map) {
      this.path = [];
      return;
    }
    const path = Pathfinder.findPath(
      map,
      { tx: this.tx, ty: this.ty },
      { tx: targetTx, ty: targetTy }
    );
    if (!path || path.length === 0) {
      this.path = [];
      return;
    }
    let simplified = Pathfinder.simplifyPath(path);
    // 去掉起点（当前所在瓦片），保留后续目标
    if (
      simplified.length > 1 &&
      simplified[0].tx === this.tx &&
      simplified[0].ty === this.ty
    ) {
      simplified = simplified.slice(1);
    }
    this.path = simplified;
    if (this.path.length > 0 && this.state !== 'dead') {
      this.state = 'moving';
    }
  }

  /**
   * 每帧更新：状态机 + 冷却 + buff
   * @param {number} dt 帧间隔（秒）
   * @param {object} [input] 输入状态（由外部交互模块读取后调用本方法）
   * @param {object} [game] 游戏上下文（供后续战斗 / AI 注入使用）
   */
  update(dt, input, game) {
    if (this.state === 'dead') {
      // 死亡状态不动作，但仍更新 buff / 冷却（buff 可能复活时已过期）
      this._updateCooldowns(dt);
      this.updateBuffs(dt);
      return;
    }

    switch (this.state) {
      case 'idle':
        // 有目标则切攻击
        if (this.target && this.target.state !== 'dead' && !this.target.dead) {
          this.state = 'attacking';
        }
        break;

      case 'moving': {
        if (this.path.length === 0) {
          this.state = 'idle';
          break;
        }
        const target = this.path[0];
        const tw = tileToWorld(target.tx, target.ty);
        const dx = tw.wx - this.wx;
        const dy = tw.wy - this.wy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 速度：每秒 moveSpeed 个瓦片，按瓦片对角线长度换算像素/秒
        const speedPxPerSec = (this.stats.moveSpeed || 0) * TILE_DIAGONAL;
        const step = speedPxPerSec * dt;

        // 更新朝向（只要有位移）
        if (dist > 0.001) this.facing = dirToFacing(dx, dy);

        if (dist < 2 || step >= dist) {
          // 到达本格：吸附到瓦片中心，pop 路径
          this.wx = tw.wx;
          this.wy = tw.wy;
          this.tx = target.tx;
          this.ty = target.ty;
          this.path.shift();
          if (this.path.length === 0) this.state = 'idle';
        } else {
          // 沿直线移动
          const ux = dx / dist;
          const uy = dy / dist;
          this.wx += ux * step;
          this.wy += uy * step;
        }
        break;
      }

      case 'attacking': {
        // 目标失效或死亡 -> 待机
        if (!this.target || this.target.state === 'dead' || this.target.dead) {
          this.target = null;
          this.state = 'idle';
          break;
        }
        // 朝目标方向
        if (this.target.tx != null && this.target.ty != null) {
          const tw = tileToWorld(this.target.tx, this.target.ty);
          this.facing = dirToFacing(tw.wx - this.wx, tw.wy - this.wy);
          // 超出攻击范围 -> 待机
          const tdist = Math.sqrt(
            (this.target.tx - this.tx) ** 2 + (this.target.ty - this.ty) ** 2
          );
          if (tdist > this.stats.attackRange + 0.5) {
            this.state = 'idle';
            break;
          }
        }
        // 攻击冷却
        this.attackCooldownMs -= dt * 1000;
        if (this.attackCooldownMs <= 0) {
          if (typeof this.onAttack === 'function') {
            this.onAttack(this, this.target);
          }
          this.attackCooldownMs = 1000 / (this.stats.attackSpeed || 1);
        }
        break;
      }

      case 'casting':
        // 简化为立即完成（castTime 在 castSkill 中已通过回调处理）
        this.state = 'idle';
        break;
    }

    // 更新冷却与 buff
    this._updateCooldowns(dt);
    this.updateBuffs(dt);
  }

  /** 更新技能冷却（dt 秒） */
  _updateCooldowns(dt) {
    if (this.cooldowns.size === 0) return;
    const deltaMs = dt * 1000;
    for (const [id, r] of this.cooldowns) {
      const nr = r - deltaMs;
      if (nr <= 0) this.cooldowns.delete(id);
      else this.cooldowns.set(id, nr);
    }
  }

  // ===== 渲染信息 =====

  /**
   * 获取精灵信息（无图阶段 image 为 null，用 color 占位）
   * @returns {{image:null, color:string, frame:null, anchorX:number, anchorY:number}}
   */
  getSprite() {
    return {
      image: null,
      color: CLASS_COLORS[this.classId] || '#cccccc',
      frame: null,
      anchorX: 0.5,
      anchorY: 1.0,
    };
  }

  /**
   * 名字颜色（按 PK 值）
   * - pkValue < 3：白色
   * - 3 ~ 7：黄色
   * - > 7：红色
   * @returns {string}
   */
  getNameColor() {
    if (this.pkValue < 3) return '#ffffff';
    if (this.pkValue <= 7) return '#ffff00';
    return '#ff0000';
  }

  /**
   * 获取渲染信息（供 Scene / 测试入口 Y 排序绘制）
   * @returns {{worldX:number, worldY:number, sprite:object, name:string, hpRatio:number, mpRatio:number, nameColor:string, level:number}}
   */
  getRenderInfo() {
    return {
      worldX: this.wx,
      worldY: this.wy,
      sprite: this.getSprite(),
      name: this.name,
      hpRatio: this.stats.maxHp > 0 ? this.stats.hp / this.stats.maxHp : 0,
      mpRatio: this.stats.maxMp > 0 ? this.stats.mp / this.stats.maxMp : 0,
      nameColor: this.getNameColor(),
      level: this.level,
    };
  }

  // ===== 复活 =====

  /**
   * 在指定瓦片复活
   * @param {object} mapData 地图数据（保留参数，便于后续安全区判定）
   * @param {number} x 瓦片 X
   * @param {number} y 瓦片 Y
   */
  respawn(mapData, x, y) {
    this.tx = x;
    this.ty = y;
    const w = tileToWorld(x, y);
    this.wx = w.wx;
    this.wy = w.wy;
    this.stats.hp = this.stats.maxHp;
    this.stats.mp = this.stats.maxMp;
    this.exp = Math.floor(this.exp * 0.9); // 死亡掉 10% 经验
    this.state = 'idle';
    this.path = [];
    this.target = null;
    this.attackCooldownMs = 0;
  }

  // ===== 序列化 =====

  /** 序列化全部字段 */
  serialize() {
    return {
      id: this.id,
      name: this.name,
      classId: this.classId,
      level: this.level,
      exp: this.exp,
      stats: this.stats.serialize(),
      equipment: this.equipment.serialize(),
      inventory: this.inventory.serialize(),
      skills: Array.from(this.skills.entries()),
      hotbar: this.hotbar.slice(),
      cooldowns: Array.from(this.cooldowns.entries()),
      buffs: this.buffs.map((b) => ({ ...b })),
      pkValue: this.pkValue,
      gold: this.gold,
      tx: this.tx,
      ty: this.ty,
      wx: this.wx,
      wy: this.wy,
      facing: this.facing,
      state: this.state,
      summonIds: this.summonIds.slice(),
    };
  }

  /**
   * 反序列化重建 Player
   * @param {object} data 序列化数据
   * @param {object} mapData 地图数据（用于默认起点）
   * @returns {Player}
   */
  static deserialize(data, mapData) {
    const p = new Player(data.classId, data.name, mapData || {}, {
      tx: data.tx,
      ty: data.ty,
      level: data.level || 1,
    });
    // 恢复 id 并推进全局计数器，避免冲突
    if (data.id != null) {
      p.id = data.id;
      if (p.id >= _nextPlayerId) _nextPlayerId = p.id + 1;
    }
    p.level = data.level || 1;
    p.exp = data.exp || 0;
    p.equipment = Equipment.deserialize(data.equipment);
    p.inventory = Inventory.deserialize(data.inventory);
    p.skills = new Map(data.skills || []);
    p.hotbar = Array.isArray(data.hotbar)
      ? data.hotbar.slice()
      : new Array(8).fill(null);
    p.cooldowns = new Map(data.cooldowns || []);
    p.buffs = Array.isArray(data.buffs)
      ? data.buffs.map((b) => ({ ...b }))
      : [];
    p.pkValue = data.pkValue || 0;
    p.gold = data.gold || 0;
    p.summonIds = Array.isArray(data.summonIds)
      ? data.summonIds.slice()
      : [];

    p.tx = data.tx != null ? data.tx : p.tx;
    p.ty = data.ty != null ? data.ty : p.ty;
    if (data.wx != null && data.wy != null) {
      p.wx = data.wx;
      p.wy = data.wy;
    } else {
      const w = tileToWorld(p.tx, p.ty);
      p.wx = w.wx;
      p.wy = w.wy;
    }
    p.facing = data.facing || 0;
    p.state = data.state || 'idle';

    // 把序列化的 hp / mp 作为重算的旧值，保留当前血魔比例
    if (data.stats) {
      if (data.stats.hp != null) p.stats.hp = data.stats.hp;
      if (data.stats.mp != null) p.stats.mp = data.stats.mp;
    }
    p.recalculateStats();
    // 死亡状态保留
    if (data.state === 'dead') p.state = 'dead';
    return p;
  }
}

export default Player;
