/**
 * DropItem.js — 地面掉落物
 *
 * 职责：
 * - 表示怪物死亡 / 玩家丢弃后在地图瓦片上生成的可拾取物品
 * - 维护瓦片坐标 (tx,ty) 与世界坐标 (wx,wy)（世界坐标由 game 在生成时回写）
 * - 可选 owner 字段实现掉落绑定（仅指定玩家可拾取）
 * - 提供渲染信息与序列化
 *
 * 约定：
 * - 物品定义（名称、占位色）从 items.js 的 getItem 取
 * - getSprite 返回的 image 字段在无图阶段为 null，渲染层用 color 占位
 */

import { getItem } from '../data/items.js';

/** 全局自增 id 计数器（单进程内唯一即可） */
let _nextDropId = 1;

export class DropItem {
  /**
   * @param {string} itemId 物品 ID
   * @param {number} count 数量
   * @param {number} tx 瓦片 X
   * @param {number} ty 瓦片 Y
   * @param {string} mapId 所属地图 ID
   * @param {string|null} [owner=null] 绑定玩家 id（null 表示自由拾取）
   * @param {number|null} [durability=null] 装备当前耐久（消耗品为 null）
   */
  constructor(itemId, count, tx, ty, mapId, owner = null, durability = null) {
    /** 唯一 id */
    this.id = _nextDropId++;
    /** 物品 ID */
    this.itemId = itemId;
    /** 数量 */
    this.count = count;
    /** 瓦片 X */
    this.tx = tx;
    /** 瓦片 Y */
    this.ty = ty;
    /** 世界坐标 X（默认等于瓦片坐标，由 game 生成时按瓦片尺寸回写） */
    this.wx = tx;
    /** 世界坐标 Y */
    this.wy = ty;
    /** 所属地图 ID */
    this.mapId = mapId;
    /** 生成时间戳（毫秒） */
    this.spawnTime = Date.now();
    /** 绑定玩家 id（可选，null 表示自由拾取） */
    this.owner = owner || null;
    /** 装备当前耐久（消耗品为 null，拾取时回写到背包格子） */
    this.durability = durability;
  }

  /**
   * 获取掉落物的精灵信息
   * - 无图阶段 image 为 null，由渲染层用 color 占位色块绘制
   * @returns {{image:null, color:string, anchorX:number, anchorY:number}}
   */
  getSprite() {
    const def = getItem(this.itemId);
    const color = (def && def.color) || '#cccccc';
    return {
      image: null,
      color,
      anchorX: 0.5,
      anchorY: 0.5,
    };
  }

  /**
   * 获取渲染信息（供 Y 排序绘制）
   * @returns {{worldX:number, worldY:number, sprite:object, name:string}}
   */
  getRenderInfo() {
    const def = getItem(this.itemId);
    return {
      worldX: this.wx,
      worldY: this.wy,
      sprite: this.getSprite(),
      name: (def && def.name) || this.itemId,
    };
  }

  /**
   * 是否可被指定玩家拾取
   * @param {string} playerId 玩家 id
   * @returns {boolean}
   */
  canPickup(playerId) {
    if (!this.owner) return true; // 自由拾取
    return this.owner === playerId;
  }

  /** 序列化 */
  serialize() {
    return {
      id: this.id,
      itemId: this.itemId,
      count: this.count,
      tx: this.tx,
      ty: this.ty,
      wx: this.wx,
      wy: this.wy,
      mapId: this.mapId,
      spawnTime: this.spawnTime,
      owner: this.owner,
      durability: this.durability,
    };
  }

  /**
   * 反序列化
   * @param {object} data
   * @returns {DropItem}
   */
  static deserialize(data) {
    if (!data) return null;
    const d = new DropItem(
      data.itemId,
      data.count,
      data.tx,
      data.ty,
      data.mapId,
      data.owner || null,
      data.durability ?? null,
    );
    d.id = data.id || d.id;
    d.wx = data.wx ?? d.wx;
    d.wy = data.wy ?? d.wy;
    d.spawnTime = data.spawnTime ?? d.spawnTime;
    // 保证全局 id 不与已反序列化的 id 冲突
    if (d.id >= _nextDropId) _nextDropId = d.id + 1;
    return d;
  }
}

export default DropItem;
