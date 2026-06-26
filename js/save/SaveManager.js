/**
 * SaveManager.js — localStorage 存档管理器
 *
 * 职责：
 * - 管理一个自动槽（auto）与 5 个手动槽（slot1~slot5）的存档读写
 * - 序列化 GameState 快照写入 localStorage，反序列化时校验/迁移版本
 * - 维护内存中的槽位元信息，供存档列表 UI 直接取用，无需每帧读盘
 * - 通过 EventEmitter 暴露 saved / loaded / deleted 事件，与 UI 解耦
 *
 * 槽位 key 格式：mir_save_auto / mir_save_slot1 ... mir_save_slot5
 *
 * 序列化格式（JSON）：
 * {
 *   version: 1,
 *   slotId,
 *   timestamp,
 *   player: { ...player.serialize() },
 *   currentMapId,
 *   monsters: [{id, monsterId, hp, tx, ty, state}], // 仅 BOSS 等需持久化的状态
 *   drops: [{itemId, count, tx, ty}],
 *   gold: number,
 * }
 *
 * 与 Player 解耦：SaveManager 仅依赖 gameState.player.serialize() 接口，
 * 不直接 import Player。Player 的具体序列化内容由 Player 任务负责。
 */

import { EventEmitter } from '../utils/eventEmitter.js';
import { CURRENT_VERSION, migrate, isCompatible } from './Migration.js';

export class SaveManager {
  /** localStorage 键前缀 */
  static SLOT_KEY_PREFIX = 'mir_save_';
  /** 自动存档槽 id */
  static AUTO_SLOT = 'auto';
  /** 手动存档槽数量 */
  static MAX_SLOTS = 5;
  /** 自动存档间隔（毫秒） */
  static AUTO_INTERVAL_MS = 60000;

  constructor() {
    /** @type {Record<string, object|null>} slotId -> 槽位元信息（或 null 表示空槽） */
    this.slots = {};
    /** 最近一次自动存档的时间戳（ms） */
    this.lastAutoSaveTime = 0;
    /** 事件发射器，事件：'saved' / 'loaded' / 'deleted' */
    this.listeners = new EventEmitter();

    // 预置所有已知槽位为空，便于 UI 直接遍历
    this.slots[SaveManager.AUTO_SLOT] = null;
    for (let i = 1; i <= SaveManager.MAX_SLOTS; i++) {
      this.slots['slot' + i] = null;
    }

    // 从 localStorage 读取所有槽位元信息
    this.loadSlotList();
  }

  // ===== 内部工具 =====

  /** 所有已知槽位 id（auto 在前，随后 slot1..slot5） */
  _allSlotIds() {
    const ids = [SaveManager.AUTO_SLOT];
    for (let i = 1; i <= SaveManager.MAX_SLOTS; i++) ids.push('slot' + i);
    return ids;
  }

  /** 槽位 id 是否合法（已知槽位） */
  _isValidSlot(slotId) {
    return typeof slotId === 'string' && slotId in this.slots;
  }

  /** 拼接 localStorage 键 */
  _slotKey(slotId) {
    return SaveManager.SLOT_KEY_PREFIX + slotId;
  }

  /**
   * 从 localStorage 原始字符串解析元信息
   * - 解析失败或格式异常返回 null（视为空/损坏槽）
   * - 仅提取 UI 所需字段，避免把完整存档常驻内存
   * @param {string|null} raw
   * @returns {object|null}
   */
  _readMeta(raw) {
    if (!raw) return null;
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return null; // JSON 损坏
    }
    if (!data || typeof data !== 'object') return null;
    const player = data.player || {};
    return {
      version: data.version,
      slotId: data.slotId,
      timestamp: data.timestamp || 0,
      name: player.name || '',
      classId: player.classId || '',
      level: player.level || 1,
      mapId: data.currentMapId || '',
    };
  }

  // ===== 槽位列表加载 =====

  /**
   * 扫描 localStorage 中所有 mir_save_* 键，加载元信息到 slots
   * - 仅识别已知槽位（auto / slot1..5），忽略未知键
   * - 读取异常的键跳过，不影响其它槽位
   */
  loadSlotList() {
    const prefix = SaveManager.SLOT_KEY_PREFIX;
    let count = localStorage.length;
    for (let i = 0; i < count; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const slotId = key.slice(prefix.length);
      if (!(slotId in this.slots)) continue; // 未知槽位，忽略

      let raw = null;
      try {
        raw = localStorage.getItem(key);
      } catch (e) {
        continue; // 读取失败（如隐私模式），跳过
      }
      const meta = this._readMeta(raw);
      this.slots[slotId] = meta; // 损坏则 meta 为 null，等同空槽
    }
  }

  // ===== 读写 =====

  /**
   * 序列化 gameState 写入指定槽位
   * @param {string} slotId 槽位 id
   * @param {object} gameState GameState.snapshot 产出的快照对象
   *   - player: 拥有 serialize() 的角色实例
   *   - currentMapId: string
   *   - gold: number
   *   - monsters: Array（已摘要）
   *   - drops: Array（已摘要）
   *   - timestamp?: number
   * @returns {{ok:boolean, reason?:string, timestamp?:number}}
   */
  save(slotId, gameState) {
    if (!this._isValidSlot(slotId)) return { ok: false, reason: 'invalid_slot' };
    if (!gameState || typeof gameState !== 'object') {
      return { ok: false, reason: 'invalid_state' };
    }
    const player = gameState.player;
    if (!player || typeof player.serialize !== 'function') {
      return { ok: false, reason: 'invalid_state' };
    }

    const data = {
      version: CURRENT_VERSION,
      slotId,
      timestamp: gameState.timestamp != null ? gameState.timestamp : Date.now(),
      player: player.serialize(),
      currentMapId: gameState.currentMapId || '',
      monsters: Array.isArray(gameState.monsters) ? gameState.monsters : [],
      drops: Array.isArray(gameState.drops) ? gameState.drops : [],
      gold: gameState.gold || 0,
    };

    let json;
    try {
      json = JSON.stringify(data);
    } catch (e) {
      return { ok: false, reason: 'serialize_failed' };
    }

    try {
      localStorage.setItem(this._slotKey(slotId), json);
    } catch (e) {
      // 容量超限或隐私模式禁用写入
      return { ok: false, reason: 'storage_error' };
    }

    // 同步更新内存元信息（_readMeta 接受原始字符串）
    this.slots[slotId] = this._readMeta(json);
    this.listeners.emit('saved', { slotId, timestamp: data.timestamp });
    return { ok: true, timestamp: data.timestamp };
  }

  /**
   * 读取并反序列化指定槽位
   * - 存档损坏（JSON 解析失败 / 版本不兼容）返回 {ok:false, reason:'corrupt'}，不抛异常
   * @param {string} slotId
   * @returns {{ok:boolean, data?:object, reason?:string, timestamp?:number}}
   *   data 为迁移后的完整存档对象，交由 GameState.restore 恢复
   */
  load(slotId) {
    if (!this._isValidSlot(slotId)) return { ok: false, reason: 'invalid_slot' };

    let raw;
    try {
      raw = localStorage.getItem(this._slotKey(slotId));
    } catch (e) {
      return { ok: false, reason: 'storage_error' };
    }
    if (!raw) return { ok: false, reason: 'empty' };

    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { ok: false, reason: 'corrupt' };
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, reason: 'corrupt' };
    }

    // 版本兼容性检查：不可迁移视为损坏
    if (!isCompatible(data)) {
      return { ok: false, reason: 'corrupt' };
    }

    // 迁移到当前版本
    data = migrate(data);

    this.listeners.emit('loaded', { slotId, timestamp: data.timestamp });
    return { ok: true, data, timestamp: data.timestamp };
  }

  /**
   * 删除指定槽位存档
   * @param {string} slotId
   * @returns {boolean} 是否删除成功
   */
  deleteSave(slotId) {
    if (!this._isValidSlot(slotId)) return false;
    try {
      localStorage.removeItem(this._slotKey(slotId));
    } catch (e) {
      return false;
    }
    this.slots[slotId] = null;
    this.listeners.emit('deleted', { slotId });
    return true;
  }

  /** 指定槽位是否存在存档 */
  hasSave(slotId) {
    if (!this._isValidSlot(slotId)) return false;
    return this.slots[slotId] != null;
  }

  /**
   * 获取单个槽位信息（用于存档列表 UI）
   * @param {string} slotId
   * @returns {{name:string, classId:string, level:number, mapId:string, timestamp:number, exists:boolean}}
   */
  getSlotInfo(slotId) {
    const meta = this._isValidSlot(slotId) ? this.slots[slotId] : null;
    if (!meta) {
      return { name: '', classId: '', level: 0, mapId: '', timestamp: 0, exists: false };
    }
    return {
      name: meta.name,
      classId: meta.classId,
      level: meta.level,
      mapId: meta.mapId,
      timestamp: meta.timestamp,
      exists: true,
    };
  }

  /**
   * 获取所有槽位信息（含 slotId），顺序为 auto + slot1..slot5
   * @returns {Array<{slotId:string, name:string, classId:string, level:number, mapId:string, timestamp:number, exists:boolean}>}
   */
  getAllSlotInfos() {
    return this._allSlotIds().map((slotId) => ({
      slotId,
      ...this.getSlotInfo(slotId),
    }));
  }

  // ===== 自动存档 =====

  /**
   * 写入自动槽（等价于 save('auto', gameState)）
   * @param {object} gameState
   * @returns {{ok:boolean, reason?:string, timestamp?:number}}
   */
  autoSave(gameState) {
    return this.save(SaveManager.AUTO_SLOT, gameState);
  }

  /**
   * 当前是否应触发自动存档
   * @param {number} now 当前时间戳（ms）
   * @returns {boolean}
   */
  shouldAutoSave(now) {
    return now - this.lastAutoSaveTime >= SaveManager.AUTO_INTERVAL_MS;
  }

  /**
   * 标记本次自动存档时间，用于节流
   * @param {number} now 当前时间戳（ms）
   */
  markAutoSaved(now) {
    this.lastAutoSaveTime = now;
  }

  // ===== 事件 =====

  /** 注册事件监听器，事件：'saved' / 'loaded' / 'deleted' */
  on(event, cb) {
    return this.listeners.on(event, cb);
  }

  /** 移除事件监听器 */
  off(event, cb) {
    return this.listeners.off(event, cb);
  }
}

export default SaveManager;
