/**
 * GameState.js — 游戏状态快照（捕获 / 恢复）
 *
 * 职责：
 * - snapshot(game)：从 Game 单例捕获当前可持久化状态，产出 SaveManager.save 所需的快照对象
 * - restore(game, data, mapData)：从快照恢复游戏状态
 *
 * 解耦约定：
 * - 不直接 import Player / Monster，避免与对应任务耦合；
 *   玩家状态通过 game.getPlayer().serialize()/deserialize() 读写，
 *   怪物刷新通过 game.respawnMonsters(mapData, bossStates) 委托，
 *   掉落物通过 game.createDrop(...) 委托。
 * - 上述 game 方法由 main.js 提供，本模块假设它们存在，并对缺省做防御处理。
 *
 * 持久化范围（精简以节省 localStorage 容量）：
 * - player：完整序列化（属性/装备/背包/技能/位置等，由 Player.serialize 决定）
 * - currentMapId：当前所在地图
 * - gold：金币
 * - monsters：仅 BOSS 的存活状态/HP（普通怪不存，加载时按地图配置重新刷新）
 * - drops：地面掉落物摘要
 * - 不存地图静态数据（瓦片/NPC/传送点等由 mapData 重建）
 */

import { MONSTERS } from '../data/monsters.js';

export class GameState {
  /**
   * 从 Game 单例捕获当前状态
   * @param {object} game Game 单例（提供 getPlayer/getCurrentMapId/getScene/getGold 等）
   * @returns {object} 快照对象，结构：
   *   { player, currentMapId, gold, monsters, drops, timestamp }
   *   其中 player 为角色实例（供 SaveManager 调用 serialize()），monsters/drops 为已摘要数组
   */
  static snapshot(game) {
    const scene = game.getScene ? game.getScene() : game.scene;
    const player = game.getPlayer ? game.getPlayer() : game.player;
    const currentMapId = game.getCurrentMapId ? game.getCurrentMapId() : game.currentMapId;

    // 金币：优先 game.getGold()，其次 game.gold，最后 player.gold
    let gold = 0;
    if (typeof game.getGold === 'function') gold = game.getGold();
    else if (game.gold != null) gold = game.gold;
    else if (player && player.gold != null) gold = player.gold;

    // 仅持久化 BOSS 状态：已死的标记为 dead（加载时不刷新），存活的记录当前 HP/位置
    const monsters = [];
    if (scene && Array.isArray(scene.monsters)) {
      for (const m of scene.monsters) {
        if (!m || !m.monsterId) continue;
        const def = MONSTERS[m.monsterId];
        const isBoss = m.isBoss === true || (def && def.isBoss === true);
        if (!isBoss) continue; // 普通怪不存
        if (m.dead) {
          monsters.push({ id: m.id, monsterId: m.monsterId, state: 'dead' });
        } else {
          monsters.push({
            id: m.id,
            monsterId: m.monsterId,
            hp: m.hp,
            tx: m.tx,
            ty: m.ty,
            state: 'alive',
          });
        }
      }
    }

    // 地面掉落物摘要（不存静态物品定义，仅存动态实例）
    const drops = [];
    if (scene && Array.isArray(scene.drops)) {
      for (const d of scene.drops) {
        if (!d || d.dead) continue;
        drops.push({
          itemId: d.itemId,
          count: d.count || 1,
          tx: d.tx,
          ty: d.ty,
        });
      }
    }

    return {
      player,
      currentMapId: currentMapId || '',
      gold,
      monsters,
      drops,
      timestamp: Date.now(),
    };
  }

  /**
   * 从快照恢复游戏状态
   * @param {object} game Game 单例
   * @param {object} data SaveManager.load 返回的存档数据
   * @param {object} mapData 当前地图数据（由 game 加载后传入，含 spawns 等）
   * @returns {boolean} 是否恢复成功（玩家缺失等致命情况返回 false）
   */
  static restore(game, data, mapData) {
    if (!game || !data) return false;
    const scene = game.getScene ? game.getScene() : game.scene;
    const player = game.getPlayer ? game.getPlayer() : game.player;

    // 1. 恢复玩家：通过 deserialize 接口重建属性/装备/背包/技能/位置
    //    （player 实例由 game 在加载流程中提供，本任务不直接 new Player）
    if (!player || typeof player.deserialize !== 'function') {
      return false;
    }
    player.deserialize(data.player, mapData);

    // 2. 恢复当前地图 id
    game.currentMapId = data.currentMapId || (mapData && mapData.id) || '';

    // 3. 恢复金币：优先 game.setGold，其次回写 game.gold 与 player.gold
    const gold = data.gold || 0;
    if (typeof game.setGold === 'function') game.setGold(gold);
    else game.gold = gold;
    if (player && 'gold' in player) player.gold = gold;

    // 4. 清空场景中的动态实体（玩家除外），准备按快照重建
    if (scene) {
      if (Array.isArray(scene.monsters)) scene.monsters.length = 0;
      if (Array.isArray(scene.drops)) scene.drops.length = 0;
      if (Array.isArray(scene.summons)) scene.summons.length = 0;
      if (Array.isArray(scene.projectiles)) scene.projectiles.length = 0;
    }

    // 5. 重新生成怪物：普通怪按 mapData.spawns 正常刷新，
    //    BOSS 按 bossStates 处理——快照中已死的不再刷新，存活的恢复 HP（与位置）。
    //    实体创建依赖 Monster 任务，此处委托给 game.respawnMonsters。
    const bossStates = GameState._indexBossStates(data.monsters);
    if (typeof game.respawnMonsters === 'function') {
      // bossStates: Map<monsterId, {state, hp, tx, ty}>
      //   state==='dead'  -> 该 BOSS 不刷新
      //   state==='alive' -> 刷新并按 hp 恢复血量、按 tx/ty 放置
      game.respawnMonsters(mapData, bossStates);
    }

    // 6. 恢复地面掉落物（委托 game.createDrop 创建实例并入场景）
    if (scene && Array.isArray(data.drops)) {
      for (const d of data.drops) {
        if (!d || !d.itemId) continue;
        if (typeof game.createDrop === 'function') {
          game.createDrop(d.itemId, d.count || 1, d.tx, d.ty);
        } else {
          // 降级：直接推入摘要对象，由游戏的掉落系统后续补全 onPickup 等行为
          scene.drops.push({
            itemId: d.itemId,
            count: d.count || 1,
            tx: d.tx,
            ty: d.ty,
          });
        }
      }
    }

    return true;
  }

  /**
   * 将快照中的 monsters 数组索引为 Map<monsterId, entry>
   * - 同一地图同类 BOSS 通常唯一，故以 monsterId 为键
   * @param {Array} monsters
   * @returns {Map<string, object>}
   */
  static _indexBossStates(monsters) {
    const map = new Map();
    if (!Array.isArray(monsters)) return map;
    for (const m of monsters) {
      if (!m || !m.monsterId) continue;
      // 已存在则不覆盖（保留第一条），避免重复条目干扰
      if (!map.has(m.monsterId)) map.set(m.monsterId, m);
    }
    return map;
  }
}

export default GameState;
