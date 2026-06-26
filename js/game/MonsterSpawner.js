/**
 * MonsterSpawner.js — 怪物刷新管理器
 *
 * 职责：
 * - 从 map.spawns 读取刷新点配置 [{x, y, monsterId, count, respawnMs}]
 * - 维护每个刷新点的状态：存活数、下次刷新时间、BOSS 是否已生成 / 已被击败
 * - update(dt, now, scene)：扫描存活怪物，不足 count 则计时刷新；BOSS 死亡后永不刷新
 * - spawnAll(scene)：初始化时立即按 count 生成全部怪物（BOSS 只生成 1 只）
 * - reset()：重置所有刷新点状态（地图切换时调用）
 *
 * 复用：
 * - monsters.js 的 getMonster（判定 isBoss）
 * - Monster.js 构造怪物实体
 * - Scene.addEntity('monster', ...) 加入场景
 *
 * 刷新计数约定：
 * - 同一刷新点生成的怪物，其 spawnTx/spawnTy 记为该刷新点坐标（即使因散开偏移出生），
 *   计数时按出生点归属（spawnTx===cfg.x && spawnTy===cfg.y）判定。
 * - 出生点归属精确且不会跨点重复计数，避免相邻同类型刷新点互相误计导致缺口漏判；
 *   被风筝到远处的怪物仍按出生点归属计数，防止刷新点误判缺口而超生。
 * - BOSS（isBoss）死亡后标记 bossDefeated，永不刷新。
 */

import { Monster } from './Monster.js';
import { getMonster } from '../data/monsters.js';
import { randInt } from '../utils/math.js';

export class MonsterSpawner {
  /**
   * @param {object} map IsometricMap 实例（提供 spawns / isWalkable）
   * @param {object} [scene] 所属场景引用（也可后续 update 时传入）
   */
  constructor(map, scene) {
    this.map = map;
    this.scene = scene || null;

    /** 默认刷新间隔（毫秒），配置缺省时使用 */
    this._defaultRespawnMs = 60000;

    /**
     * 刷新检查间隔（毫秒）：每秒只做一次全量存活扫描，
     * 避免每帧 O(刷新点数 × 怪物数) 扫描。60 秒级刷新计时对 1 秒精度不敏感。
     */
    this._checkIntervalMs = 1000;
    /** 检查累积器（毫秒） */
    this._checkAccumMs = 0;

    /** 刷新点状态列表 */
    this.spawnPoints = [];
    this._initSpawnPoints();
  }

  /** 从 map.spawns 构建刷新点状态 */
  _initSpawnPoints() {
    const spawns = (this.map && Array.isArray(this.map.spawns)) ? this.map.spawns : [];
    this.spawnPoints = spawns.map((cfg) => {
      const def = getMonster(cfg.monsterId);
      const isBoss = !!(def && def.isBoss);
      return {
        config: {
          x: cfg.x,
          y: cfg.y,
          monsterId: cfg.monsterId,
          count: cfg.count || 1,
          respawnMs: cfg.respawnMs != null ? cfg.respawnMs : (def && def.respawnMs) || this._defaultRespawnMs,
        },
        isBoss,
        aliveCount: 0,
        /** 下次刷新时间戳（毫秒），0 表示尚未排期 */
        nextRespawnTime: 0,
        /** BOSS 是否已生成过（用于区分"未生成"与"已击败"） */
        bossSpawned: false,
        /** BOSS 是否已被击败（击败后永不刷新） */
        bossDefeated: false,
      };
    });
  }

  // ===== 主更新 =====

  /**
   * 每帧刷新检查（定时全量扫描，默认每秒一次）
   * - 全量存活扫描 O(刷新点数 × 怪物数) 较重，改为每 _checkIntervalMs 执行一次；
   *   60 秒级刷新计时与 BOSS 击败判定对 1 秒精度不敏感。
   * - 间隔内的帧直接跳过，避免每帧重复扫描。
   * @param {number} dt 帧间隔（秒，保留参数便于未来扩展）
   * @param {number} now 当前时间戳（毫秒）
   * @param {object} [scene] 所属场景
   */
  update(dt, now, scene) {
    scene = scene || this.scene;
    if (!scene) return;
    if (now == null || now <= 0) now = Date.now();

    // 累积时间，未到检查间隔则跳过本帧的全量扫描
    this._checkAccumMs += dt * 1000;
    if (this._checkAccumMs < this._checkIntervalMs) return;
    // 消耗一个检查周期（保留余数，避免漂移）
    this._checkAccumMs -= this._checkIntervalMs;

    for (const sp of this.spawnPoints) {
      const alive = this._countAlive(sp, scene);
      sp.aliveCount = alive;

      // BOSS：仅生成一次，死亡后永不刷新
      if (sp.isBoss) {
        if (sp.bossDefeated) continue;
        if (!sp.bossSpawned) {
          // 首次生成（spawnAll 未调用时的兜底）
          this._spawnOne(sp, scene);
          sp.bossSpawned = true;
        } else if (alive === 0) {
          // 已生成过且当前无存活 → 已被击败
          sp.bossDefeated = true;
        }
        continue;
      }

      // 普通怪物：不足 count 则计时刷新
      if (alive < sp.config.count) {
        if (sp.nextRespawnTime === 0) {
          sp.nextRespawnTime = now + sp.config.respawnMs;
        }
        if (now >= sp.nextRespawnTime) {
          this._spawnOne(sp, scene);
          // 仍有缺口则下一帧重新排期刷新下一只
          sp.nextRespawnTime = 0;
        }
      } else {
        sp.nextRespawnTime = 0;
      }
    }
  }

  // ===== 批量生成 =====

  /**
   * 立即按 count 生成所有刷新点的怪物（BOSS 只生成 1 只）
   * 用于场景初始化。
   * @param {object} [scene]
   */
  spawnAll(scene) {
    scene = scene || this.scene;
    if (!scene) return;
    for (const sp of this.spawnPoints) {
      const target = sp.isBoss ? 1 : sp.config.count;
      for (let i = 0; i < target; i++) {
        this._spawnOne(sp, scene);
      }
      if (sp.isBoss) {
        sp.bossSpawned = true;
        sp.bossDefeated = false;
      }
      sp.nextRespawnTime = 0;
    }
  }

  // ===== 重置 =====

  /**
   * 重置所有刷新点状态（地图切换 / 重新初始化时调用）
   * 注意：本方法只重置刷新点状态，不清理场景中已存在的怪物实体。
   */
  reset() {
    for (const sp of this.spawnPoints) {
      sp.aliveCount = 0;
      sp.nextRespawnTime = 0;
      sp.bossSpawned = false;
      sp.bossDefeated = false;
    }
    // 重置检查累积器，使新地图立即做一次扫描
    this._checkAccumMs = 0;
  }

  // ===== 内部辅助 =====

  /**
   * 统计某刷新点的存活怪物数（同 monsterId）
   * - 按出生点归属判定：spawnTx/spawnTy 与刷新点一致即归属该点
   * - 出生点归属精确且不会跨点重复计数（_spawnOne 始终把 spawnTx/spawnTy
   *   记为刷新点坐标），避免相邻同类型刷新点互相误计导致缺口漏判
   * - 被风筝到远处的怪物仍按出生点归属计数，防止刷新点误判缺口而超生
   * @param {object} sp 刷新点状态
   * @param {object} scene
   * @returns {number}
   */
  _countAlive(sp, scene) {
    const cfg = sp.config;
    const monsters = (scene && scene.monsters) || [];
    let count = 0;
    for (const m of monsters) {
      if (!m || m.monsterId !== cfg.monsterId) continue;
      if (m.state === 'dead' || m.alive === false) continue;
      // 出生点归属（精确，不依赖当前位置）
      if (m.spawnTx === cfg.x && m.spawnTy === cfg.y) count++;
    }
    return count;
  }

  /**
   * 在刷新点生成一只怪物
   * - 多只同点刷新时在出生点附近 1 格随机散开，避免完全重叠
   * - 怪物的 spawnTx/spawnTy 始终记为刷新点坐标，保证刷新计数归属正确
   * @param {object} sp 刷新点状态
   * @param {object} scene
   */
  _spawnOne(sp, scene) {
    const cfg = sp.config;
    let tx = cfg.x;
    let ty = cfg.y;
    // 出生点附近 1 格随机散开（需可行走）
    if (this.map && typeof this.map.isWalkable === 'function') {
      for (let attempt = 0; attempt < 6; attempt++) {
        const nx = cfg.x + randInt(-1, 1);
        const ny = cfg.y + randInt(-1, 1);
        if (this.map.isWalkable(nx, ny)) { tx = nx; ty = ny; break; }
      }
    }
    const monster = new Monster(cfg.monsterId, tx, ty, this.map, {
      respawnMs: cfg.respawnMs,
      scene,
    });
    // 出生点归属记为刷新点坐标（即便因散开而偏移），用于刷新计数
    monster.spawnTx = cfg.x;
    monster.spawnTy = cfg.y;
    scene.addEntity('monster', monster);
  }
}

export default MonsterSpawner;
