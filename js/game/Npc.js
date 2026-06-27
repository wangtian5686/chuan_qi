/**
 * Npc.js — 城镇 NPC 实体
 *
 * 职责：
 * - 维护 NPC 基础属性：坐标 / 朝向 / 状态 / 商店售卖列表
 * - 守卫（guard）类型在 update 中侦测视野内红名玩家（pkValue > 7）并发起攻击（一击必杀）
 * - canTalk 判定玩家是否在对话范围内；interact 通过 game 回调打开对应 UI 窗口
 * - getRenderInfo 输出占位渲染信息（color + 名字），实际绘制由 Scene 统一 Y 排序完成
 *
 * 复用：
 * - items.js 的 getItem 解析商店物品价格
 * - utils/math.js 的 distance 做范围判定
 * - IsometricMap.tileToWorld（由构造传入的 map 提供）做瓦片→世界坐标换算
 *
 * 不直接 import UI 模块：交互通过 game.openShop / game.openRepair /
 * game.openTeleportDialog 回调，由 main.js 在联调时连接具体窗口。
 */

import { getItem } from '../data/items.js';
import { distance } from '../utils/math.js';
import { SpriteRenderer } from '../engine/SpriteRenderer.js';

/** NPC 类型 → 占位色 */
const NPC_COLORS = {
  weapon_shop: '#CD7F32', // 棕铜
  armor_shop: '#808080',  // 灰
  potion_shop: '#00FF00', // 绿
  misc_shop: '#FFA500',   // 橙
  blacksmith: '#B22222',  // 红
  teleporter: '#9370DB',  // 紫
  guard: '#4169E1',       // 蓝
};

/** 守卫攻击力（高攻击力，一击必杀普通玩家） */
const GUARD_DAMAGE = 99999;

/**
 * 默认商店配置：每种商店类型售卖的物品列表
 * - 条目仅含 itemId（count 可选，缺省视为无限供应）
 * - 实际买价在 Npc 构造时由 getItem(itemId).price 注入
 * - blacksmith / teleporter / guard 不售卖物品，列表为空
 * @type {Record<string, Array<{itemId:string, count?:number}>>}
 */
export const NPC_SHOPS = {
  weapon_shop: [
    { itemId: 'wooden_sword' },
    { itemId: 'iron_sword' },
    { itemId: 'steel_sword' },
    { itemId: 'wooden_staff' },
  ],
  armor_shop: [
    { itemId: 'cloth_armor' },
    { itemId: 'leather_armor' },
    { itemId: 'steel_armor' },
    { itemId: 'leather_helmet' },
    { itemId: 'steel_helmet' },
    { itemId: 'leather_boots' },
    { itemId: 'steel_boots' },
  ],
  potion_shop: [
    { itemId: 'hp_potion_small' },
    { itemId: 'hp_potion_medium' },
    { itemId: 'hp_potion_large' },
    { itemId: 'mp_potion_small' },
    { itemId: 'mp_potion_medium' },
    { itemId: 'mp_potion_large' },
    { itemId: 'home_scroll' },
  ],
  misc_shop: [
    { itemId: 'iron_ring' },
    { itemId: 'iron_bracelet' },
    { itemId: 'pearl_necklace' },
    { itemId: 'cure_potion' },
  ],
  blacksmith: [],
  teleporter: [],
  guard: [],
};

/** 等距瓦片像素尺寸（与 IsometricMap 一致），用于 map 缺省时回退换算 */
const TILE_W = 64;
const TILE_H = 32;

export class Npc {
  /**
   * @param {object} config NPC 配置 {id, x, y, name, type, shop?}
   * @param {object} map IsometricMap 实例（提供 tileToWorld）
   */
  constructor(config, map) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;

    // 瓦片坐标
    this.tx = config.x;
    this.ty = config.y;

    // 世界坐标（瓦片中心）
    const w = this._tileToWorld(map, this.tx, this.ty);
    this.wx = w.wx;
    this.wy = w.wy;

    // 占位色（按 type 区分）
    this.color = NPC_COLORS[this.type] || '#888888';

    // 商店列表：config.shop 优先，否则取默认 NPC_SHOPS[type]
    this.shop = this._resolveShop(config.shop);

    this.facing = 0;
    this.state = 'idle';

    // 守卫标识与侦测参数
    this.isGuard = this.type === 'guard';
    /** 守卫视野范围（瓦片） */
    this.visionRange = 8;
    /** 对话范围（瓦片） */
    this.talkRange = 2;
    /** 守卫攻击冷却（毫秒） */
    this.attackCooldownMs = 0;
    /** 当前攻击目标（仅 guard 使用） */
    this.target = null;
  }

  /**
   * 瓦片坐标 → 世界像素坐标
   * 优先用 map.tileToWorld；map 缺失时回退到与 IsometricMap 一致的公式
   * @returns {{wx:number, wy:number}}
   */
  _tileToWorld(map, tx, ty) {
    if (map && typeof map.tileToWorld === 'function') {
      return map.tileToWorld(tx, ty);
    }
    return {
      wx: (tx - ty) * (TILE_W / 2),
      wy: (tx + ty) * (TILE_H / 2),
    };
  }

  /**
   * 规范化商店列表：填充买价（取自 items.js 的 price）
   * - 输入可为 undefined（取默认）、或 [{itemId, count?}] / [{itemId, price, count?}]
   * - 物品 ID 无效的条目跳过
   * @returns {Array<{itemId:string, price:number, count?:number}>}
   */
  _resolveShop(rawShop) {
    let src = rawShop;
    if (!Array.isArray(src)) src = NPC_SHOPS[this.type] || [];
    const out = [];
    for (const entry of src) {
      if (!entry || !entry.itemId) continue;
      const def = getItem(entry.itemId);
      if (!def) continue; // 无效物品跳过
      const item = {
        itemId: entry.itemId,
        price: entry.price != null ? entry.price : (def.price || 0),
      };
      if (entry.count != null) item.count = entry.count;
      out.push(item);
    }
    return out;
  }

  /**
   * 每帧更新
   * - guard：侦测视野内红名玩家（pkValue > 7），进入 attack 状态并攻击（一击必杀）
   * - 其他类型：保持 idle
   * @param {number} dt 帧间隔（秒）
   * @param {object} scene 场景上下文（可选，用于取 player）
   * @param {object} game 游戏上下文（可选，用于取 player）
   */
  update(dt, scene, game) {
    if (this.type === 'guard') {
      const player = (game && game.player) || (scene && scene.player);
      if (
        player &&
        player.state !== 'dead' &&
        typeof player.pkValue === 'number' &&
        player.pkValue > 7
      ) {
        const dist = distance(this.tx, this.ty, player.tx, player.ty);
        if (dist <= this.visionRange) {
          this.state = 'attack';
          this.target = player;
          this.attackCooldownMs -= dt * 1000;
          if (this.attackCooldownMs <= 0) {
            // 高攻击力，一击必杀普通玩家
            if (typeof player.takeDamage === 'function') {
              player.takeDamage(GUARD_DAMAGE);
            }
            this.attackCooldownMs = 1500;
          }
          return;
        }
      }
      // 失去目标或目标非红名 → 回到待机
      this.state = 'idle';
      this.target = null;
    }
    // 非守卫 NPC 保持 idle
  }

  /**
   * 玩家是否在对话范围内
   * @param {object} player
   * @returns {boolean}
   */
  canTalk(player) {
    if (!player) return false;
    return distance(player.tx, player.ty, this.tx, this.ty) <= this.talkRange;
  }

  /**
   * 玩家与 NPC 交互：根据 type 通过 game 回调打开对应 UI
   * - 商店类：game.openShop(this)
   * - blacksmith：game.openRepair()
   * - teleporter：game.openTeleportDialog(this)
   * - guard：敌对，不交互
   * @param {object} player
   * @param {object} game
   */
  interact(player, game) {
    if (!game) return;
    switch (this.type) {
      case 'weapon_shop':
      case 'armor_shop':
      case 'potion_shop':
      case 'misc_shop':
        if (typeof game.openShop === 'function') game.openShop(this);
        break;
      case 'blacksmith':
        if (typeof game.openRepair === 'function') game.openRepair();
        break;
      case 'teleporter':
        if (typeof game.openTeleportDialog === 'function') game.openTeleportDialog(this);
        break;
      case 'guard':
        // 守卫敌对，不提供交互
        break;
      default:
        break;
    }
  }

  /**
   * 获取渲染信息（供 Scene / 测试入口 Y 排序绘制）
   * @returns {{worldX:number, worldY:number, sprite:{color:string}, name:string, nameColor:string, level:number}}
   */
  getRenderInfo() {
    return {
      worldX: this.wx,
      worldY: this.wy,
      sprite: { color: this.color },
      name: this.name,
      nameColor: '#00ff00',
      level: 0,
    };
  }

  /**
   * 获取精灵描述（供 Scene._wrapEntity 使用）
   * - 带 camera：返回 {sortY, draw}
   * - 不带 camera：返回占位色信息
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
    return { image: null, color: this.color };
  }

  /** 实际绘制：阴影 + 色块占位 + 名字 */
  _render(ctx, camera) {
    SpriteRenderer.drawShadow(ctx, camera, this.wx, this.wy, 14);
    const s = camera.worldToScreen(this.wx, this.wy);
    const bw = 24;
    const bh = 40;
    ctx.save();
    ctx.fillStyle = this.color;
    ctx.fillRect(s.x - bw / 2, s.y - bh, bw, bh);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(s.x - bw / 2, s.y - bh, bw, bh);
    ctx.restore();
    if (this.name) {
      SpriteRenderer.drawNameTag(
        ctx, camera, this.wx, this.wy, this.name, '#00ff00',
      );
    }
  }
}

export default Npc;
