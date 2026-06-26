/**
 * skills.js — 技能配置表
 *
 * 涵盖三大职业的全部技能：
 * - 战士：基础剑术/攻杀剑术/刺杀剑术/半月弯刀/烈火剑法/野蛮冲撞
 * - 法师：火球术/抗拒火环/诱惑之光/地狱雷光/魔法盾/冰咆哮/火墙术/瞬间移动
 * - 道士：治愈术/精神力战法/施毒术/灵魂火符/召唤骷髅/隐身术/召唤神兽/魔法盾
 *
 * 伤害公式：damage.base + damage.perLevel * (skillLevel - 1) + damage.coefficient * 攻击属性
 * - damageType='physical' 时取施法者 minAtk/maxAtk
 * - damageType='magic' 时取施法者 minMatk/maxMatk
 * - 命中/闪避/暴击/幸运诅咒由战斗系统判定，本表仅给出伤害区间
 *
 * effect 枚举（通用 + 扩展）：
 *   heal | shield | poison | stun | speed_up | hide | lure
 *   burn（燃烧 DOT）| slow（减速）| repel（推开）| burn_ground（地面燃烧）
 *
 * magic_shield 由法师与道士共用，classId 标记为 'mage'（起源职业），
 * 道士能否学习由 classes.js 的 learnableSkills 控制。
 */

/**
 * 技能定义对象，键为技能 ID
 * @type {Record<string, object>}
 */
export const SKILLS = {
  // ==================== 战士技能 ====================
  basic_swordmanship: {
    id: 'basic_swordmanship',
    name: '基础剑术',
    classId: 'warrior',
    learnLevel: 1,
    type: 'melee',
    mpCost: 0,
    cooldown: 0,
    range: 1,
    damage: { base: 0, perLevel: 0, coefficient: 1.0 },
    damageType: 'physical',
    castTime: 0,
    description: '战士入门剑术，普攻替代，无消耗',
  },
  attack_slash: {
    id: 'attack_slash',
    name: '攻杀剑术',
    classId: 'warrior',
    learnLevel: 7,
    type: 'melee',
    mpCost: 3,
    cooldown: 1.5,
    range: 1,
    damage: { base: 0, perLevel: 1, coefficient: 1.3 },
    damageType: 'physical',
    flags: { extraHitChance: 0.3 }, // 30% 概率追加一次攻击
    castTime: 0,
    description: '近战连击，造成 1.3 倍物攻，30% 概率追加一次攻击',
  },
  thrust_slash: {
    id: 'thrust_slash',
    name: '刺杀剑术',
    classId: 'warrior',
    learnLevel: 15,
    type: 'melee',
    mpCost: 4,
    cooldown: 2,
    range: 2, // 穿透直线 2 格
    damage: { base: 0, perLevel: 1, coefficient: 1.0 },
    damageType: 'physical',
    flags: { pierce: true, ignoreDef: 0.5 }, // 穿透直线，无视 50% 防御
    castTime: 0,
    description: '穿透直线 2 格，无视目标 50% 防御',
  },
  half_moon: {
    id: 'half_moon',
    name: '半月弯刀',
    classId: 'warrior',
    learnLevel: 19,
    type: 'aoe',
    mpCost: 5,
    cooldown: 3,
    range: 1,
    aoeRadius: 3, // 前方 3 格锥形
    aoeShape: 'cone',
    damage: { base: 0, perLevel: 1, coefficient: 1.0 },
    damageType: 'physical',
    castTime: 0,
    description: '扇形 AOE，前方 3 格锥形范围物理伤害',
  },
  fire_blade: {
    id: 'fire_blade',
    name: '烈火剑法',
    classId: 'warrior',
    learnLevel: 24,
    type: 'melee',
    mpCost: 7,
    cooldown: 4,
    range: 1,
    damage: { base: 0, perLevel: 2, coefficient: 1.5 },
    damageType: 'physical',
    effect: 'burn',
    effectValue: { base: 0, perLevel: 0, coefficient: 0.3 }, // 每秒 30% 物攻
    effectDuration: 3,
    effectTick: 1,
    castTime: 0,
    description: '近战 1.5 倍物攻，附带 3 秒燃烧，每秒 30% 物攻伤害',
  },
  savage_charge: {
    id: 'savage_charge',
    name: '野蛮冲撞',
    classId: 'warrior',
    learnLevel: 27,
    type: 'melee',
    mpCost: 8,
    cooldown: 6,
    range: 3, // 突进 3 格
    damage: { base: 0, perLevel: 2, coefficient: 1.5 },
    damageType: 'physical',
    effect: 'stun',
    effectDuration: 1,
    flags: { dash: 3 }, // 突进 3 格
    castTime: 0,
    description: '突进 3 格，撞到敌人造成 1.5 倍物攻并眩晕 1 秒',
  },

  // ==================== 法师技能 ====================
  fireball: {
    id: 'fireball',
    name: '火球术',
    classId: 'mage',
    learnLevel: 1,
    type: 'projectile',
    mpCost: 3,
    cooldown: 1,
    range: 5,
    damage: { base: 8, perLevel: 4, coefficient: 1.0 },
    damageType: 'magic',
    projectileSpeed: 8, // 瓦片/秒
    castTime: 0,
    description: '发射火球，远程魔法伤害',
  },
  repel_fire: {
    id: 'repel_fire',
    name: '抗拒火环',
    classId: 'mage',
    learnLevel: 12,
    type: 'aoe',
    mpCost: 5,
    cooldown: 4,
    range: 0, // 自身为中心
    aoeRadius: 1,
    aoeShape: 'circle',
    damage: { base: 5, perLevel: 2, coefficient: 0.3 },
    damageType: 'magic',
    effect: 'repel',
    effectValue: { base: 1, perLevel: 0 }, // 推开 1 格
    castTime: 0,
    description: '自身周围 1 格 AOE，推开敌人并造成少量伤害',
  },
  lure_light: {
    id: 'lure_light',
    name: '诱惑之光',
    classId: 'mage',
    learnLevel: 13,
    type: 'debuff',
    mpCost: 6,
    cooldown: 8,
    range: 4,
    damage: null,
    effect: 'lure',
    effectDuration: 5,
    flags: { bossImmune: true }, // 对 BOSS 无效
    castTime: 0,
    description: '诱惑怪物停止攻击 5 秒，对 BOSS 无效',
  },
  hell_thunder: {
    id: 'hell_thunder',
    name: '地狱雷光',
    classId: 'mage',
    learnLevel: 17,
    type: 'aoe',
    mpCost: 8,
    cooldown: 3,
    range: 5,
    aoeRadius: 2,
    aoeShape: 'circle',
    damage: { base: 10, perLevel: 5, coefficient: 0.8 },
    damageType: 'magic',
    flags: { undeadBonus: 1.5 }, // 对不死系 1.5 倍
    castTime: 0,
    description: '目标周围 2 格 AOE 闪电伤害，对不死系加成 1.5 倍',
  },
  magic_shield: {
    id: 'magic_shield',
    name: '魔法盾',
    classId: 'mage', // 法师与道士共用，起源职业标记为法师
    learnLevel: 22,
    type: 'buff',
    mpCost: 15,
    cooldown: 30,
    range: 0,
    damage: null,
    effect: 'shield',
    effectValue: { base: 0, perLevel: 0, coefficient: 2.0 }, // 吸收量 = MP 上限 × 2
    effectDuration: 30,
    castTime: 0,
    description: '吸收伤害，吸收量为 MP 上限 × 2，持续 30 秒或吸收完',
  },
  blizzard: {
    id: 'blizzard',
    name: '冰咆哮',
    classId: 'mage',
    learnLevel: 30,
    type: 'aoe',
    mpCost: 12,
    cooldown: 5,
    range: 6,
    aoeRadius: 2,
    aoeShape: 'circle',
    damage: { base: 15, perLevel: 6, coefficient: 0.9 },
    damageType: 'magic',
    effect: 'slow',
    effectValue: { base: 0.5, perLevel: 0 }, // 减速 50%
    effectDuration: 3,
    castTime: 0.5,
    description: '远程目标位置 AOE，半径 2 格，减速 50% 持续 3 秒',
  },
  fire_wall: {
    id: 'fire_wall',
    name: '火墙术',
    classId: 'mage',
    learnLevel: 24,
    type: 'aoe',
    mpCost: 10,
    cooldown: 5,
    range: 5,
    aoeRadius: 1,
    aoeShape: 'line', // 3 格长条
    aoeLength: 3,
    damage: { base: 5, perLevel: 2, coefficient: 0.4 }, // 每秒伤害
    damageType: 'magic',
    effect: 'burn_ground',
    effectDuration: 8,
    effectTick: 1, // 每秒结算一次
    castTime: 0,
    description: '在地面放置 3 格火墙，持续 8 秒，经过的敌人每秒受魔法伤害',
  },
  teleport: {
    id: 'teleport',
    name: '瞬间移动',
    classId: 'mage',
    learnLevel: 19,
    type: 'teleport',
    mpCost: 5,
    cooldown: 2,
    range: 0,
    damage: null,
    castTime: 0,
    description: '随机传送到本地图任意可行走瓦片',
  },

  // ==================== 道士技能 ====================
  heal: {
    id: 'heal',
    name: '治愈术',
    classId: 'taoist',
    learnLevel: 1,
    type: 'buff',
    mpCost: 4,
    cooldown: 1,
    range: 3, // 友方含自己
    damage: null,
    effect: 'heal',
    effectValue: { base: 20, perLevel: 8 }, // 恢复 = base + perLevel * skillLevel
    effectDuration: 0, // 瞬时回复
    castTime: 0,
    description: '恢复友方 HP（含自己），数值随技能等级增长',
  },
  spirit_force: {
    id: 'spirit_force',
    name: '精神力战法',
    classId: 'taoist',
    learnLevel: 7,
    type: 'buff',
    mpCost: 8,
    cooldown: 10,
    range: 0,
    damage: null,
    effect: 'speed_up', // 复用为命中/魔攻增益 buff
    effectValue: { hit: 5, minMatk: 2, maxMatk: 3 }, // 增加命中与魔攻
    effectDuration: 300, // 5 分钟
    castTime: 0,
    description: '增加命中和魔攻，持续 5 分钟',
  },
  poison: {
    id: 'poison',
    name: '施毒术',
    classId: 'taoist',
    learnLevel: 13,
    type: 'debuff',
    mpCost: 5,
    cooldown: 2,
    range: 3,
    damage: null, // 直接伤害为 0，伤害来自 DOT
    effect: 'poison',
    effectValue: { base: 8, perLevel: 3 }, // 每秒毒伤害
    effectDuration: 8,
    effectTick: 1,
    flags: { maxStacks: 3 }, // 可叠加 3 次
    castTime: 0,
    description: '目标每秒受毒伤害，持续 8 秒，可叠加 3 次',
  },
  soul_fire: {
    id: 'soul_fire',
    name: '灵魂火符',
    classId: 'taoist',
    learnLevel: 14,
    type: 'projectile',
    mpCost: 4,
    cooldown: 1.5,
    range: 5,
    damage: { base: 6, perLevel: 3, coefficient: 0.9 },
    damageType: 'magic',
    projectileSpeed: 7,
    flags: { undeadBonus: 1.3 }, // 对不死系加成
    castTime: 0,
    description: '投射物魔法伤害，对不死系加成',
  },
  summon_skeleton: {
    id: 'summon_skeleton',
    name: '召唤骷髅',
    classId: 'taoist',
    learnLevel: 19,
    type: 'summon',
    mpCost: 12,
    cooldown: 5,
    range: 1,
    damage: null,
    summonId: 'skeleton',
    effectDuration: 60, // 存在 60 秒
    castTime: 0,
    description: '召唤一只骷髅宝宝协助战斗，存在 60 秒',
  },
  hide: {
    id: 'hide',
    name: '隐身术',
    classId: 'taoist',
    learnLevel: 20,
    type: 'buff',
    mpCost: 6,
    cooldown: 8,
    range: 0,
    damage: null,
    effect: 'hide',
    effectDuration: 20,
    flags: { breakOnMove: true, breakOnAttack: true }, // 移动或攻击解除
    castTime: 0,
    description: '怪物无法发现玩家，移动或攻击解除，持续 20 秒',
  },
  summon_beast: {
    id: 'summon_beast',
    name: '召唤神兽',
    classId: 'taoist',
    learnLevel: 35,
    type: 'summon',
    mpCost: 20,
    cooldown: 10,
    range: 1,
    damage: null,
    summonId: 'beast',
    effectDuration: 60, // 存在 60 秒
    castTime: 0,
    description: '召唤一只神兽（强力）协助战斗，存在 60 秒',
  },
};

/**
 * 按 ID 取技能定义
 * @param {string} id 技能 ID
 * @returns {object|undefined} 技能定义（不存在则 undefined）
 */
export function getSkill(id) {
  return SKILLS[id];
}

/**
 * 计算技能直接命中伤害区间
 *
 * 伤害公式：base + perLevel * (skillLevel - 1) + coefficient * 攻击属性
 * - physical 取施法者 minAtk/maxAtk
 * - magic 取施法者 minMatk/maxMatk
 * - 非伤害技能（damage 为 null）返回 null
 * - 防御减免、命中、暴击、幸运诅咒由战斗系统判定
 *
 * @param {object} skill 技能定义
 * @param {object} caster 施法者，需含 level、minAtk/maxAtk 或 minMatk/maxMatk、skillLevel
 * @param {object} [target] 目标（当前仅用于扩展，不影响原始伤害区间）
 * @returns {{min: number, max: number}|null} 伤害区间；无伤害返回 null
 */
export function computeDamage(skill, caster, target) {
  if (!skill || !skill.damage) return null;

  const dmg = skill.damage;
  // 技能等级：未提供时按 1 级处理
  const skillLevel = caster.skillLevel || 1;
  const base = dmg.base + dmg.perLevel * (skillLevel - 1);

  // 按伤害类型选取攻击属性区间
  let minAtkValue = 0;
  let maxAtkValue = 0;
  if (skill.damageType === 'magic') {
    minAtkValue = caster.minMatk || 0;
    maxAtkValue = caster.maxMatk || 0;
  } else {
    minAtkValue = caster.minAtk || 0;
    maxAtkValue = caster.maxAtk || 0;
  }

  const coefficient = dmg.coefficient || 0;
  const min = base + coefficient * minAtkValue;
  const max = base + coefficient * maxAtkValue;

  return { min, max };
}

export default SKILLS;
