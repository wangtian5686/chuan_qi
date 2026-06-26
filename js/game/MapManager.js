/**
 * MapManager.js — 地图切换与传送管理器
 *
 * 职责：
 * - loadMap(mapId, targetX, targetY, game)：切图核心
 *     1. 卸载旧场景（清空动态实体，保留 player）
 *     2. 创建新 IsometricMap / Scene / MonsterSpawner
 *     3. 初始化怪物（spawner.spawnAll）与 NPC（通过 game.createNpc 回调）
 *     4. 把 player 放到目标瓦片，重置移动状态
 *     5. 更新相机跟随 / 触发自动存档
 * - checkTeleport(player, dt)：检测玩家是否踩中传送点，命中则切图（1 秒冷却）
 * - update(dt, game)：每帧检查传送 + 驱动 spawner
 *
 * 复用（不重新实现）：
 * - getMap(id) 从 data/maps/index.js 取地图数据
 * - IsometricMap / Scene / MonsterSpawner
 * - Player 的 tx/ty/wx/wy/state/path/target 字段
 *
 * 依赖约定：
 * - game 单例提供：getPlayer() / setScene(scene) / getScene() / createNpc(cfg) / autoSave() / camera
 * - NPC 类由 Task 12 提供，本类不直接 import Npc.js（避免循环依赖），
 *   统一通过 game.createNpc(npcConfig) 回调创建；回调不存在则跳过 NPC 创建。
 */

import { getMap } from '../data/maps/index.js';
import { IsometricMap } from '../engine/IsometricMap.js';
import { Scene } from '../engine/Scene.js';
import { Pathfinder } from '../engine/Pathfinder.js';
import { MonsterSpawner } from './MonsterSpawner.js';

/** 传送冷却（毫秒），防止反复触发 */
const TELEPORT_COOLDOWN_MS = 1000;

export class MapManager {
  /**
   * @param {object} game Game 单例（提供 getPlayer/setScene/getScene/createNpc/autoSave/camera）
   */
  constructor(game) {
    this.game = game;
    /** 当前地图 id */
    this.currentMapId = '';
    /** 当前 IsometricMap 实例 */
    this.currentMap = null;
    /** 当前 Scene 实例 */
    this.scene = null;
    /** 当前 MonsterSpawner 实例 */
    this.spawner = null;
    /** 传送冷却剩余毫秒（>0 时屏蔽传送触发） */
    this.teleportCooldown = 0;
  }

  /**
   * 加载 / 切换地图
   * @param {string} mapId 目标地图 id
   * @param {number} [targetX] 玩家落地瓦片 X（缺省取 mapData.playerStart.x）
   * @param {number} [targetY] 玩家落地瓦片 Y
   * @param {object} [game] Game 单例（缺省取构造时传入的 this.game）
   * @returns {{ok:boolean, mapId:string, error?:string}}
   */
  loadMap(mapId, targetX, targetY, game) {
    const g = game || this.game;
    const mapData = getMap(mapId);
    if (!mapData) {
      return { ok: false, mapId, error: `地图不存在: ${mapId}` };
    }

    // 1. 卸载旧场景：清空动态实体（保留 player 实例本身，稍后迁入新场景）
    const player = this._extractPlayer(g);
    if (this.scene) {
      this.scene.monsters = [];
      this.scene.npcs = [];
      this.scene.drops = [];
      this.scene.projectiles = [];
      this.scene.summons = [];
      this.scene.player = null;
    }
    // 释放旧 spawner（仅重置状态，实体已由上一步清空）
    if (this.spawner && typeof this.spawner.reset === 'function') {
      this.spawner.reset();
    }
    this.spawner = null;

    // 清空寻路缓存：旧地图路径不再有效，避免切图后误用陈旧路径
    Pathfinder.clearCache();

    // 2. 创建新地图 / 场景 / 刷新器
    const newMap = new IsometricMap(mapData);
    const newScene = new Scene(newMap);
    // 保留 player：迁入新场景
    if (player) {
      newScene.addEntity('player', player);
    }

    const newSpawner = new MonsterSpawner(newMap, newScene);

    // 3. 把 player 放到目标瓦片（缺省取 playerStart）
    if (player) {
      const tx = targetX != null ? targetX : (mapData.playerStart ? mapData.playerStart.x : 0);
      const ty = targetY != null ? targetY : (mapData.playerStart ? mapData.playerStart.y : 0);
      player.tx = tx;
      player.ty = ty;
      const w = newMap.tileToWorld(player.tx, player.ty);
      player.wx = w.wx;
      player.wy = w.wy;
      player.path = [];
      player.state = 'idle';
      player.target = null;
    }

    // 4. 初始化怪物
    newSpawner.spawnAll(newScene);

    // 5. 创建 NPC（由 game.createNpc 回调提供实现，避免与 Npc.js 循环依赖）
    const npcConfigs = newMap.npcs || [];
    for (const npcConfig of npcConfigs) {
      if (g && typeof g.createNpc === 'function') {
        const npc = g.createNpc(npcConfig);
        if (npc) newScene.addEntity('npc', npc);
      }
      // 回调不存在则跳过 NPC 创建（Task 12 未接入前可正常切图）
    }

    // 6. 更新相机：设置新地图边界并立即贴合 player
    if (g && g.camera) {
      const b = newMap.worldBounds;
      if (typeof g.camera.clamp === 'function' && b) {
        g.camera.clamp(b.minX, b.minY, b.maxX, b.maxY);
      }
      if (player && typeof g.camera.follow === 'function') {
        // lerp=1 立即贴合，避免切图后相机从旧位置缓慢漂移
        g.camera.follow({ x: player.wx, y: player.wy }, 1);
      } else if (player) {
        g.camera.x = player.wx;
        g.camera.y = player.wy;
      }
    }

    // 7. 更新 Game 的场景引用
    if (g && typeof g.setScene === 'function') {
      g.setScene(newScene);
    }

    // 8. 切图触发自动存档
    if (g && typeof g.autoSave === 'function') {
      try {
        g.autoSave();
      } catch (_e) {
        // 自动存档失败不应阻断切图流程
      }
    }

    // 9. 提交本管理器状态
    this.currentMapId = mapId;
    this.currentMap = newMap;
    this.scene = newScene;
    this.spawner = newSpawner;

    return { ok: true, mapId };
  }

  /**
   * 检查玩家是否踩中传送点，命中则切图
   * @param {object} player 玩家实例（需有 tx/ty）
   * @param {number} dt 帧间隔（秒）
   */
  checkTeleport(player, dt) {
    // 冷却倒计时（dt 为秒，换算为毫秒）
    if (this.teleportCooldown > 0) {
      this.teleportCooldown -= dt * 1000;
      if (this.teleportCooldown > 0) return;
    }
    if (!player || !this.currentMap) return;

    const teleports = this.currentMap.teleports || [];
    for (const t of teleports) {
      if (t && player.tx === t.x && player.ty === t.y) {
        // 命中传送点：执行切图
        this.loadMap(t.targetMap, t.targetX, t.targetY, this.game);
        // 设置 1 秒冷却，防止反复触发
        this.teleportCooldown = TELEPORT_COOLDOWN_MS;
        return;
      }
    }
  }

  /**
   * 每帧更新：检查传送 + 驱动怪物刷新器
   * @param {number} dt 帧间隔（秒）
   * @param {object} game Game 单例
   */
  update(dt, game) {
    const g = game || this.game;
    // 1. 传送检测（取 player 优先 game.getPlayer，回退当前场景的 player）
    const player = (g && typeof g.getPlayer === 'function') ? g.getPlayer() : (this.scene && this.scene.player);
    if (player) {
      this.checkTeleport(player, dt);
    }
    // 2. 怪物刷新
    if (this.spawner && this.scene) {
      this.spawner.update(dt, performance.now(), this.scene);
    }
  }

  // ===== 访问器 =====

  /** @returns {IsometricMap|null} */
  getCurrentMap() {
    return this.currentMap;
  }

  /** @returns {string} */
  getCurrentMapId() {
    return this.currentMapId;
  }

  /** @returns {Scene|null} */
  getScene() {
    return this.scene;
  }

  /** @returns {MonsterSpawner|null} */
  getSpawner() {
    return this.spawner;
  }

  // ===== 内部辅助 =====

  /**
   * 取出当前 player 实例（用于跨场景保留）
   * 优先从 game.getPlayer() 取；否则回退到旧场景的 player。
   * @param {object} g Game 单例
   * @returns {object|null}
   */
  _extractPlayer(g) {
    if (g && typeof g.getPlayer === 'function') {
      const p = g.getPlayer();
      if (p) return p;
    }
    return this.scene ? this.scene.player : null;
  }
}

export default MapManager;
