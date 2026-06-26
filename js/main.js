/**
 * main.js — 游戏主入口（Task 19 全流程联调）
 *
 * 职责：
 * - 初始化 Canvas / GameLoop / AssetLoader / Input / Camera
 * - 维护游戏状态机：LOADING / MAIN_MENU / CHARACTER_CREATE / PLAYING / PAUSED
 * - 集成所有已实现模块：引擎层、数据层、游戏实体层、UI 层、存档层
 * - 实现完整流程：主菜单 → 创建角色 → 进入比奇城 → 战斗 / 切图 / 商店 / 升级 / 死亡复活 / 自动存档
 *
 * 注意：
 * - 不修改已实现模块，仅 import
 * - 所有代码使用 ES6 module
 * - 注释用中文
 * - 本地 GameState 枚举与 save/GameState.js 类重名，import 时用别名
 *   `import { GameState as GameStateSnapshot } from './save/GameState.js'`
 * - 鼠标坐标用 CSS 像素（与 Camera / setTransform(dpr) 后的绘图坐标系一致）
 * - GameState.restore 内部调用 player.deserialize（实例方法）与 Player.deserialize（静态方法）
 *   签名不匹配，故 continue/load 流程绕过 GameState.restore，手动用
 *   Player.deserialize 静态方法重建 player 实例
 * - SkillSystem.update(dt) 只接收 dt（无 scene 参数），无 render 方法；
 *   渲染时遍历 getEffects()/getDamageTexts()/getFireWalls() 自行绘制
 * - Player.castSkill(skillId, targetX, targetY) 的 targetX/targetY 为瓦片坐标，
 *   右键施法时需先用 map.worldToTile 把鼠标世界坐标转为瓦片坐标
 */

import { GameLoop } from './engine/GameLoop.js';
import { AssetLoader } from './engine/AssetLoader.js';
import { Input } from './engine/Input.js';
import { Camera } from './engine/Camera.js';
import { SpriteRenderer } from './engine/SpriteRenderer.js';
import { PerfMonitor } from './utils/PerfMonitor.js';

import { getMap } from './data/maps/index.js';
import { getClass, getStartItems } from './data/classes.js';
import { getItem } from './data/items.js';
import { SLOT_TO_EQUIP } from './game/Equipment.js';

import { Player } from './game/Player.js';
import { CombatSystem } from './game/CombatSystem.js';
import { SkillSystem } from './game/SkillSystem.js';
import { PkSystem } from './game/PkSystem.js';
import { Pickup } from './game/Pickup.js';
import { MapManager } from './game/MapManager.js';
import { createNpc } from './game/NpcFactory.js';

import { MainMenu } from './ui/MainMenu.js';
import { CharacterCreateMenu } from './ui/CharacterCreateMenu.js';
import { UiManager } from './ui/UiManager.js';
import { PauseMenu } from './ui/PauseMenu.js';
import { LoadingScreen } from './ui/LoadingScreen.js';

import { InputHandler } from './game/KeyBindings.js';

import { SaveManager } from './save/SaveManager.js';
import { GameState as GameStateSnapshot } from './save/GameState.js';

// ===== 本地游戏状态枚举 =====
const GameState = {
  LOADING: 'LOADING',
  MAIN_MENU: 'MAIN_MENU',
  CHARACTER_CREATE: 'CHARACTER_CREATE',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
};

/** 比奇城复活点（瓦片坐标） */
const RESPAWN_MAP = 'bicicheng';
const RESPAWN_TX = 30;
const RESPAWN_TY = 33;
/** 死亡复活延迟（秒） */
const DEATH_RESPAWN_DELAY = 5;

/** Game 单例：集中管理所有子系统与状态 */
const Game = {
  // ----- 核心子系统 -----
  canvas: null,
  ctx: null,
  loop: null,
  assets: null,
  input: null,
  camera: null,

  // ----- 调试 / 性能监控 -----
  /** 是否启用调试模式（URL 带 ?debug=1） */
  debug: false,
  /** PerfMonitor 实例（仅调试模式创建） */
  perf: null,

  // ----- 状态 -----
  state: GameState.LOADING,
  payload: null,
  selectedClass: null,

  // ----- 游戏实体子系统（PLAYING 状态下创建） -----
  player: null,
  scene: null,
  mapManager: null,
  combat: null,
  skillSystem: null,
  pkSystem: null,
  pickup: null,
  ui: null,
  inputHandler: null,
  saveManager: null,
  /** 全局金币缓存（与 player.gold 同步） */
  gold: 0,

  // ----- UI 层 -----
  mainMenu: null,
  characterCreateMenu: null,
  pauseMenu: null,
  loadingScreen: null,

  // ----- 死亡复活计时 -----
  deathTimer: 0,

  // ===== 生命周期 =====

  /** 初始化并启动 */
  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');

    // 适配 canvas 内部分辨率
    this.resizeCanvas();

    // 调试模式：URL 带 ?debug=1 启用性能监控（统计 update/render 耗时、实体数、绘制调用数）
    this.debug = new URLSearchParams(window.location.search).has('debug');
    if (this.debug) {
      this.perf = new PerfMonitor();
      this.perf.instrumentContext(this.ctx);
    }

    // 子系统
    this.assets = new AssetLoader();
    this.input = new Input(this.canvas);
    // 视口使用 CSS 像素，与 setTransform(dpr) 后的坐标系一致
    this.camera = new Camera(window.innerWidth, window.innerHeight);

    // 存档管理器
    this.saveManager = new SaveManager();

    // 加载界面
    this.loadingScreen = new LoadingScreen(this.canvas);

    // 主菜单（继续游戏可用性依赖 saveManager）
    this.mainMenu = new MainMenu(this.canvas, this.input, this.saveManager);
    this._bindMainMenuCallbacks();

    // 创建角色菜单
    this.characterCreateMenu = new CharacterCreateMenu(this.canvas, this.input);
    this._bindCharacterCreateCallbacks();

    // 暂停菜单
    this.pauseMenu = new PauseMenu(this.canvas, this.input, this);

    // 主循环：固定步长更新 + rAF 渲染
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (interp) => this.render(interp)
    );

    // 窗口尺寸变化
    window.addEventListener('resize', () => this.resizeCanvas());

    // 进入加载状态并预加载资源
    this.changeState(GameState.LOADING);
    this._preloadAssets();
  },

  /** 适配 canvas 内部分辨率到窗口尺寸（HiDPI 友好） */
  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    // 让绘图坐标系按 CSS 像素计算
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (this.camera) {
      this.camera.setViewport(w, h);
    }
  },

  // ===== 资源预加载 =====

  /** 资源预加载：当前无外部资源，仅生成占位图后切到主菜单 */
  _preloadAssets() {
    this.loadingScreen.setProgress(0, '正在加载资源...');

    this.assets.onProgress = (percent) => {
      this.loadingScreen.setProgress(percent / 100, '正在加载资源...');
    };

    // 骨架阶段 manifest 为空；后续接入真实资源时填入
    const manifest = { images: {}, jsons: {} };

    this.assets
      .preload(manifest)
      .then(() => {
        // 生成若干占位精灵，供渲染模块直接取用
        this._generatePlaceholders();
        this.loadingScreen.setProgress(1, '加载完成');
        this.changeState(GameState.MAIN_MENU);
      })
      .catch((err) => {
        console.error('资源加载失败:', err);
        this.loadingScreen.setProgress(1, '资源加载失败，请刷新重试');
      });
  },

  /** 生成占位精灵图（纯色 Canvas），避免依赖外部资源 */
  _generatePlaceholders() {
    this.assets.generatePlaceholderImage('player_warrior', 48, 64, '#c8902a', '战士');
    this.assets.generatePlaceholderImage('player_mage', 48, 64, '#3a7bd5', '法师');
    this.assets.generatePlaceholderImage('player_taoist', 48, 64, '#3aa860', '道士');
    this.assets.generatePlaceholderImage('tile_grass', 64, 32, '#3a7a32');
    this.assets.generatePlaceholderImage('tile_dirt', 64, 32, '#7a5a2a');
  },

  // ===== 状态机 =====

  /**
   * 切换游戏状态
   * @param {string} state GameState 之一
   * @param {*} [payload] 附加数据
   */
  changeState(state, payload) {
    this._onExitState(this.state);
    this.state = state;
    this.payload = payload || null;
    this._onEnterState(state, payload);
    console.log(`[Game] 状态切换 -> ${state}`, payload || '');
  },

  _onEnterState(state, payload) {
    switch (state) {
      case GameState.LOADING:
        // 加载由 loadingScreen 绘制
        break;
      case GameState.MAIN_MENU:
        if (this.mainMenu) this.mainMenu.show();
        break;
      case GameState.CHARACTER_CREATE:
        if (this.characterCreateMenu) this.characterCreateMenu.show();
        break;
      case GameState.PLAYING:
        if (this.mainMenu) this.mainMenu.hide();
        if (this.characterCreateMenu) this.characterCreateMenu.hide();
        if (this.pauseMenu) this.pauseMenu.hide();
        // PLAYING 进入时确保 UI 已创建
        if (!this.ui && this.canvas && this.input) {
          this.ui = new UiManager(this.canvas, this.input, this);
        }
        break;
      case GameState.PAUSED:
        if (this.pauseMenu) this.pauseMenu.show();
        break;
    }
  },

  _onExitState(state) {
    switch (state) {
      case GameState.MAIN_MENU:
        if (this.mainMenu) this.mainMenu.hide();
        break;
      case GameState.CHARACTER_CREATE:
        if (this.characterCreateMenu) this.characterCreateMenu.hide();
        break;
      case GameState.PLAYING:
        // 切到暂停时关闭 UI 面板，避免暂停后面板仍响应输入
        if (this.ui) this.ui.closeAll();
        break;
      case GameState.PAUSED:
        if (this.pauseMenu) this.pauseMenu.hide();
        break;
    }
  },

  // ===== UI 回调绑定 =====

  _bindMainMenuCallbacks() {
    this.mainMenu.onNewGame = () => {
      this.changeState(GameState.CHARACTER_CREATE);
    };
    this.mainMenu.onContinue = () => {
      // 继续游戏：加载自动存档
      this.continueGame();
    };
    this.mainMenu.onSettings = () => {
      // 设置暂未实现，提示后返回
      if (this.ui) {
        this.ui.showDialog('设置功能暂未实现', [{ label: '确定', close: true }]);
      }
    };
    this.mainMenu.onAbout = () => {
      if (this.ui) {
        this.ui.showDialog('热血传奇 1:1 复刻\nTask 19 全流程联调', [{ label: '确定', close: true }]);
      } else {
        // UI 尚未创建时直接在主菜单上提示（简单 alert 替代）
        console.log('热血传奇 1:1 复刻 - Task 19 全流程联调');
      }
    };
  },

  _bindCharacterCreateCallbacks() {
    this.characterCreateMenu.onConfirm = (classId, name) => {
      this.startNewGame(classId, name);
    };
  },

  // ===== 新游戏 / 读档流程 =====

  /**
   * 开始新游戏：创建角色 → 进入比奇城
   * @param {string} classId 职业 ID
   * @param {string} name 角色名
   */
  startNewGame(classId, name) {
    const mapData = getMap(RESPAWN_MAP);
    if (!mapData) {
      console.error('起始地图不存在:', RESPAWN_MAP);
      return;
    }
    // 创建玩家（初始位置取比奇城复活点）
    const player = new Player(classId, name, mapData, {
      tx: RESPAWN_TX,
      ty: RESPAWN_TY,
      level: 1,
    });
    this.player = player;

    // 起始装备穿戴 + 起始技能学习 + 快捷栏绑定
    this._equipStartItems(player, classId);
    this._learnStartSkills(player, classId);

    // 注入战斗回调
    this._attachPlayerCallbacks(player);

    // 同步金币
    this.gold = player.gold || 0;

    // 创建地图管理器并加载比奇城
    if (!this.mapManager) {
      this.mapManager = new MapManager(this);
    }
    this.mapManager.loadMap(RESPAWN_MAP, RESPAWN_TX, RESPAWN_TY, this);

    // 进入 PLAYING 状态（_onEnterState 会创建 UiManager）
    this.changeState(GameState.PLAYING, { classId });

    // 立即触发一次自动存档
    this.autoSave();
  },

  /**
   * 穿戴起始装备：equipped 标记的穿到对应装备槽，其余进背包
   * @param {object} player Player 实例
   * @param {string} classId 职业 ID
   */
  _equipStartItems(player, classId) {
    const startItems = getStartItems(classId);
    for (const entry of startItems) {
      const def = entry.item;
      if (!def) continue;
      if (entry.equipped && def.slot) {
        // 穿戴到对应槽（戒指/手镯有两个槽，找空槽）
        const slots = SLOT_TO_EQUIP[def.slot];
        if (slots && slots.length > 0) {
          let targetSlot = slots[0];
          for (const s of slots) {
            if (!player.equipment.getSlot(s)) {
              targetSlot = s;
              break;
            }
          }
          player.equipment.equip(targetSlot, def.id, def.maxDurability || def.durability || 0);
        }
      } else {
        // 进背包
        const durability = def.maxDurability != null ? def.maxDurability : null;
        player.inventory.addItem(def.id, entry.count || 1, durability);
      }
    }
    player.recalculateStats();
  },

  /**
   * 学习起始技能并绑定 F1
   * @param {object} player Player 实例
   * @param {string} classId 职业 ID
   */
  _learnStartSkills(player, classId) {
    const cls = getClass(classId);
    if (!cls || !cls.startSkills) return;
    for (const skillId of cls.startSkills) {
      player.learnSkill(skillId);
    }
    // 绑定第一个起始技能到 F1（hotbar[0]）
    if (cls.startSkills.length > 0) {
      player.hotbar[0] = cls.startSkills[0];
    }
  },

  /**
   * 注入玩家战斗回调：onAttack / onCastSkill
   * @param {object} player Player 实例
   */
  _attachPlayerCallbacks(player) {
    if (!player) return;
    const self = this;
    player.onAttack = (p, target) => {
      if (!target) return;
      // 死亡目标不攻击
      if (target.state === 'dead' || target.alive === false) return;
      // PK 合法性校验
      if (self.pkSystem) {
        const r = self.pkSystem.canAttack(p, target);
        if (!r.allowed) return;
      }
      // 调用战斗系统结算玩家普攻
      if (self.combat && typeof self.combat.playerAttack === 'function') {
        const res = self.combat.playerAttack(p, target);
        // PK 攻击事件钩子（非击杀）
        if (self.pkSystem && !res.miss) {
          self.pkSystem.onAttack(p, target, false);
        }
        // 若目标致死，触发 onKill
        if (self.pkSystem && (target.state === 'dead' || target.alive === false)) {
          self.pkSystem.onKill(p, target);
        }
      }
    };
    player.onCastSkill = (p, skill, targetX, targetY) => {
      if (!skill) return;
      const skillLevel = (p.skills && p.skills.get(skill.id)) || 1;
      if (self.skillSystem) {
        self.skillSystem.execute(p, skill, skillLevel, targetX, targetY, self);
      }
    };
  },

  /**
   * 继续游戏：加载自动存档
   */
  continueGame() {
    if (!this.saveManager) return;
    if (!this.saveManager.hasSave('auto')) {
      // 无自动存档，尝试 slot1
      if (this.saveManager.hasSave('slot1')) {
        this.loadGame('slot1');
      } else {
        console.warn('无可用存档');
      }
      return;
    }
    this.loadGame('auto');
  },

  /**
   * 加载指定槽位存档
   * 绕过 GameState.restore（其内部 player.deserialize 为实例方法调用，
   * 与 Player.deserialize 静态方法不匹配），手动用 Player.deserialize 重建 player。
   * @param {string} slotId 槽位 id
   */
  loadGame(slotId) {
    if (!this.saveManager) return;
    const result = this.saveManager.load(slotId);
    if (!result.ok) {
      console.warn('读档失败:', result.reason);
      if (this.ui) {
        this.ui.showDialog(`读档失败：${result.reason}`, [{ label: '确定', close: true }]);
      }
      return;
    }
    const data = result.data;
    const mapId = data.currentMapId || RESPAWN_MAP;
    const mapData = getMap(mapId);
    if (!mapData) {
      console.error('存档地图不存在:', mapId);
      return;
    }

    // 用 Player.deserialize 静态方法重建 player（绕过 GameState.restore 不匹配）
    const player = Player.deserialize(data.player, mapData);
    this.player = player;

    // 注入战斗回调
    this._attachPlayerCallbacks(player);

    // 同步金币
    this.gold = data.gold || 0;
    player.gold = this.gold;

    // 创建地图管理器并加载存档所在地图（用 player 自身坐标作为落地）
    if (!this.mapManager) {
      this.mapManager = new MapManager(this);
    }
    const targetX = data.player.tx != null ? data.player.tx : RESPAWN_TX;
    const targetY = data.player.ty != null ? data.player.ty : RESPAWN_TY;
    this.mapManager.loadMap(mapId, targetX, targetY, this);

    // 恢复地面掉落物（委托 createDrop）
    if (Array.isArray(data.drops)) {
      for (const d of data.drops) {
        if (d && d.itemId) this.createDrop(d.itemId, d.count || 1, d.tx, d.ty);
      }
    }

    // 进入 PLAYING 状态
    this.changeState(GameState.PLAYING);

    console.log(`[Game] 读档成功：${player.name} Lv${player.level} @ ${mapId}`);
  },

  // ===== Game 接口（供 MapManager / GameState / NPC / UI 调用） =====

  /** @returns {object|null} */
  getPlayer() { return this.player; },

  /** @returns {object|null} */
  getScene() { return this.scene; },

  /**
   * 设置当前场景并重建依赖 scene 的子系统
   * @param {object} scene Scene 实例
   */
  setScene(scene) {
    this.scene = scene;
    // 重建依赖 scene 的战斗 / 技能 / PK / 拾取子系统
    this.combat = new CombatSystem(scene);
    this.skillSystem = new SkillSystem(scene, this.combat);
    // PkSystem 需要 map 引用，mapManager.loadMap 调用 setScene 时 currentMap 已就绪
    const map = this.mapManager ? this.mapManager.currentMap : null;
    this.pkSystem = new PkSystem(scene, map, this);
    this.pickup = new Pickup(scene);
    // Scene 上挂 combat 引用，供 Monster 内部 (scene.combat) 调用
    if (scene) scene.combat = this.combat;
    // 重新注入 player 回调（skillSystem 已重建）
    if (this.player) this._attachPlayerCallbacks(this.player);
  },

  /** @returns {string} */
  getCurrentMapId() {
    return this.mapManager ? this.mapManager.currentMapId : '';
  },

  /** @returns {number} */
  getGold() { return this.gold; },

  /** @param {number} v */
  setGold(v) {
    this.gold = v;
    if (this.player) this.player.gold = v;
  },

  /**
   * 创建 NPC 实例（由 MapManager.loadMap 回调调用）
   * @param {object} npcConfig NPC 配置
   * @returns {object} Npc 实例
   */
  createNpc(npcConfig) {
    const map = this.mapManager ? this.mapManager.currentMap : null;
    return createNpc(npcConfig, map);
  },

  /**
   * 重新生成怪物（由 GameState.restore 委托；当前 loadGame 流程已绕过 restore，
   * 此处保留接口供未来扩展）
   * @param {object} mapData 地图数据
   * @param {Map} bossStates BOSS 状态映射
   */
  respawnMonsters(mapData, bossStates) {
    // 当前 loadGame 流程通过 mapManager.loadMap 重新刷新所有怪物，
    // BOSS 状态恢复未实现（保留接口）
  },

  /**
   * 创建地面掉落物并加入当前场景
   * @param {string} itemId 物品 ID
   * @param {number} count 数量
   * @param {number} tx 瓦片 X
   * @param {number} ty 瓦片 Y
   */
  createDrop(itemId, count, tx, ty) {
    if (!this.scene || !this.mapManager || !this.mapManager.currentMap) return;
    const map = this.mapManager.currentMap;
    const mapId = this.mapManager.currentMapId;
    const def = getItem(itemId);
    const durability = def && def.maxDurability != null ? def.maxDurability : null;
    // 局部 import DropItem 以避免顶部循环依赖
    import('./game/DropItem.js').then(({ DropItem }) => {
      const drop = new DropItem(itemId, count, tx, ty, mapId, null, durability);
      const w = map.tileToWorld(tx, ty);
      drop.wx = w.wx;
      drop.wy = w.wy;
      this.scene.addEntity('drop', drop);
    });
  },

  /**
   * 拾取回调（由 Pickup 触发）
   * @param {object} item 物品定义
   * @param {number} count 数量
   */
  onPickup(item, count) {
    // 当前仅日志，可扩展为 HUD 提示
    if (item && item.id === 'gold') {
      console.log(`[Pickup] 拾取 ${count} 金币`);
    } else if (item) {
      console.log(`[Pickup] 拾取 ${item.name || item.id} ×${count}`);
    }
  },

  /** 自动存档（按 SaveManager 间隔节流） */
  autoSave() {
    if (!this.saveManager || !this.player || this.state !== GameState.PLAYING) return;
    const now = Date.now();
    if (!this.saveManager.shouldAutoSave(now)) return;
    try {
      const snapshot = GameStateSnapshot.snapshot(this);
      this.saveManager.autoSave(snapshot);
      this.saveManager.markAutoSaved(now);
    } catch (e) {
      console.warn('自动存档失败:', e);
    }
  },

  _checkAutoSave() {
    this.autoSave();
  },

  // ===== 暂停 / 返回主菜单 =====

  /** 切换暂停状态（由 Esc 触发） */
  togglePause() {
    if (this.state === GameState.PLAYING) {
      this.changeState(GameState.PAUSED);
    } else if (this.state === GameState.PAUSED) {
      this.changeState(GameState.PLAYING);
    }
  },

  /** 返回主菜单（由暂停菜单触发） */
  returnToMainMenu() {
    // 离开前做一次自动存档
    this.autoSave();
    // 清理 PLAYING 状态子系统引用（保留 saveManager / assets 等）
    this.player = null;
    this.scene = null;
    this.combat = null;
    this.skillSystem = null;
    this.pkSystem = null;
    this.pickup = null;
    this.deathTimer = 0;
    if (this.ui) this.ui.closeAll();
    this.changeState(GameState.MAIN_MENU);
  },

  // ===== UI 委托方法（供 Npc.interact / PauseMenu / KeyBindings 调用） =====

  /** @param {object} npc Npc 实例 */
  openShop(npc) { if (this.ui) this.ui.openShop(npc); },
  openRepair() { if (this.ui) this.ui.openRepair(); },
  /**
   * @param {object} npc Npc 实例
   * @param {Array} destinations 目的地列表
   */
  openTeleportDialog(npc, destinations) { if (this.ui) this.ui.openTeleportDialog(npc, destinations); },
  /**
   * @param {string} text 对话文本
   * @param {Array} options 选项列表
   */
  showDialog(text, options) { if (this.ui) this.ui.showDialog(text, options); },
  /** @param {'save'|'load'} mode */
  openSaveWindow(mode) { if (this.ui) this.ui.openSaveWindow(mode); },

  // ===== 快捷键动作（由 InputHandler 调用） =====

  /**
   * 施放快捷栏指定槽位的技能
   * @param {number} idx 快捷栏索引 0~7
   */
  castHotbarSkill(idx) {
    const player = this.player;
    if (!player || player.state === 'dead') return;
    const skillId = player.hotbar[idx];
    if (!skillId) return;
    // 目标瓦片：优先当前攻击目标，否则朝 facing 方向 2 格
    let tx = player.tx;
    let ty = player.ty;
    if (player.target && player.target.tx != null && player.target.state !== 'dead') {
      tx = player.target.tx;
      ty = player.target.ty;
    } else {
      // facing: 0=下 1=左下 2=左 3=左上 4=上 5=右上 6=右 7=右下
      const dirs = [[0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1]];
      const d = dirs[player.facing] || [0, 1];
      tx = player.tx + d[0] * 2;
      ty = player.ty + d[1] * 2;
    }
    player.castSkill(skillId, tx, ty);
  },

  /** 拾取周围物品（由 Space 触发；Pickup 已自动拾取，此处保留接口） */
  pickupNearby() {
    // Pickup 系统每帧自动拾取，无需额外处理
  },

  /** 快速使用红药（由 Q 触发） */
  useHpPotion() {
    const player = this.player;
    if (!player || !player.inventory) return;
    // 找背包中第一个 hp 药水
    const slots = player.inventory.slots || [];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s) continue;
      const def = getItem(s.itemId);
      if (def && def.type === 'potion' && def.effect === 'heal_hp') {
        import('./game/ItemOps.js').then(({ useItem }) => {
          useItem(player, i);
        });
        return;
      }
    }
  },

  /** 快速使用蓝药（由 R 触发） */
  useMpPotion() {
    const player = this.player;
    if (!player || !player.inventory) return;
    const slots = player.inventory.slots || [];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      if (!s) continue;
      const def = getItem(s.itemId);
      if (def && def.type === 'potion' && def.effect === 'heal_mp') {
        import('./game/ItemOps.js').then(({ useItem }) => {
          useItem(player, i);
        });
        return;
      }
    }
  },

  /** 大地图（暂留接口） */
  openChat() { /* 聊天暂未实现 */ },

  /**
   * 传送到指定地图（由 TeleportDialog 触发）
   * @param {string} mapId 目标地图 id
   * @param {number} x 落地瓦片 X
   * @param {number} y 落地瓦片 Y
   */
  teleportTo(mapId, x, y) {
    if (!this.mapManager) return;
    this.mapManager.loadMap(mapId, x, y, this);
  },

  /** 使用回城卷轴：传送到比奇城复活点 */
  teleportHome() {
    if (!this.mapManager) return;
    this.mapManager.loadMap(RESPAWN_MAP, RESPAWN_TX, RESPAWN_TY, this);
  },

  // ===== 主循环：更新 =====

  /** 每个固定步长的逻辑更新 */
  update(dt) {
    if (this.perf) this.perf.beginUpdate();
    switch (this.state) {
      case GameState.LOADING:
        // 加载由 loadingScreen 显示，无需更新
        break;
      case GameState.MAIN_MENU:
        if (this.mainMenu) this.mainMenu.update(dt, this.input);
        break;
      case GameState.CHARACTER_CREATE:
        if (this.characterCreateMenu) this.characterCreateMenu.update(dt, this.input);
        break;
      case GameState.PLAYING:
        this._updatePlaying(dt);
        break;
      case GameState.PAUSED:
        if (this.pauseMenu) this.pauseMenu.update(dt, this.input);
        // 暂停菜单 hide() 表示"继续游戏"，恢复到 PLAYING
        if (this.pauseMenu && !this.pauseMenu.visible && this.state === GameState.PAUSED) {
          this.changeState(GameState.PLAYING);
        }
        break;
    }

    // 每帧末尾重置输入瞬时状态
    this.input.update();
    if (this.perf) this.perf.endUpdate();
  },

  /** PLAYING 状态下的逐帧更新 */
  _updatePlaying(dt) {
    const player = this.player;
    if (!player) return;

    // 1. 鼠标世界坐标回写（CSS 像素 → 世界坐标）
    const m = this.input.getMouse();
    const w = this.camera.screenToWorld(m.x, m.y);
    m.worldX = w.x;
    m.worldY = w.y;

    // 2. 快捷键处理（F1-F8 / Space / Q R / Esc 等）
    if (this.inputHandler) {
      this.inputHandler.update(dt);
    } else if (this.input && this) {
      this.inputHandler = new InputHandler(this.input, this);
      this.inputHandler.update(dt);
    }

    // 3. UI 更新（返回是否消费了本帧鼠标点击）
    let uiConsumed = false;
    if (this.ui) {
      uiConsumed = this.ui.update(dt, this.input, player);
    }

    // 4. 世界点击处理（UI 未消费时）
    if (!uiConsumed) {
      if (m.leftPressed) {
        this._handleWorldClick();
      }
      if (m.rightPressed) {
        this._handleWorldRightClick();
      }
    }

    // 5. 地图管理（传送检测 + 怪物刷新器）
    if (this.mapManager) this.mapManager.update(dt, this);

    // 6. 场景更新（驱动 player / monster / npc / drop / projectile / summon）
    if (this.scene) this.scene.update(dt, this.input, this);

    // 7. 技能系统更新（只接收 dt，自持 effects/damageTexts/fireWalls/dots/stuns）
    if (this.skillSystem) this.skillSystem.update(dt);

    // 8. PK 系统更新（在线衰减 + 守卫执法）
    if (this.pkSystem) this.pkSystem.update(dt, this);

    // 9. 拾取系统更新
    if (this.pickup) this.pickup.update(dt, this);

    // 10. 相机跟随玩家
    if (this.camera && player) {
      this.camera.follow({ x: player.wx, y: player.wy });
    }

    // 11. 自动存档检查
    this._checkAutoSave();

    // 12. 死亡复活检查
    this._checkDeathAndRespawn(dt);

    // 13. 性能监控：上报实体数量（玩家 + 怪物 + NPC + 掉落物 + 投射物 + 召唤物）
    if (this.perf && this.scene) {
      const s = this.scene;
      this.perf.setEntityCount(
        (s.player ? 1 : 0) +
        (s.monsters ? s.monsters.length : 0) +
        (s.npcs ? s.npcs.length : 0) +
        (s.drops ? s.drops.length : 0) +
        (s.projectiles ? s.projectiles.length : 0) +
        (s.summons ? s.summons.length : 0)
      );
    }
  },

  /**
   * 鼠标左键点击世界：NPC 交互 / 怪物攻击 / 寻路移动
   */
  _handleWorldClick() {
    const player = this.player;
    if (!player || player.state === 'dead') return;
    const map = this.mapManager ? this.mapManager.currentMap : null;
    if (!map) return;
    const m = this.input.getMouse();
    // 鼠标世界坐标 → 瓦片坐标
    const tile = map.worldToTile(m.worldX, m.worldY);
    const tx = Math.floor(tile.tx);
    const ty = Math.floor(tile.ty);
    const scene = this.scene;

    // 1. NPC 交互：点击 NPC 所在瓦片附近
    if (scene && Array.isArray(scene.npcs)) {
      for (const npc of scene.npcs) {
        if (!npc) continue;
        if (Math.abs(tx - npc.tx) <= 1 && Math.abs(ty - npc.ty) <= 1) {
          if (typeof npc.canTalk === 'function' && npc.canTalk(player)) {
            npc.interact(player, this);
            return;
          }
        }
      }
    }

    // 2. 怪物攻击：点击怪物所在瓦片附近
    if (scene && Array.isArray(scene.monsters)) {
      for (const monster of scene.monsters) {
        if (!monster) continue;
        if (monster.state === 'dead' || monster.alive === false) continue;
        if (Math.abs(tx - monster.tx) <= 1 && Math.abs(ty - monster.ty) <= 1) {
          // PK 合法性校验
          if (this.pkSystem) {
            const r = this.pkSystem.canAttack(player, monster);
            if (!r.allowed) continue;
          }
          player.target = monster;
          player.state = 'attacking';
          return;
        }
      }
    }

    // 3. 否则寻路移动
    player.target = null;
    player.setDestination(tx, ty, map);
  },

  /**
   * 鼠标右键点击世界：施放快捷栏 F1 技能（或已学第一个技能）
   */
  _handleWorldRightClick() {
    const player = this.player;
    if (!player || player.state === 'dead') return;
    const map = this.mapManager ? this.mapManager.currentMap : null;
    if (!map) return;
    // 默认施放 hotbar[0]；若空则取已学第一个技能
    let skillId = player.hotbar[0];
    if (!skillId && player.skills && player.skills.size > 0) {
      skillId = player.skills.keys().next().value;
    }
    if (!skillId) return;
    const m = this.input.getMouse();
    // 鼠标世界坐标 → 瓦片坐标（Player.castSkill 接收瓦片坐标）
    const tile = map.worldToTile(m.worldX, m.worldY);
    player.castSkill(skillId, Math.floor(tile.tx), Math.floor(tile.ty));
  },

  /**
   * 死亡复活检查：玩家死亡 5 秒后在比奇城复活点复活
   * @param {number} dt 帧间隔（秒）
   */
  _checkDeathAndRespawn(dt) {
    const player = this.player;
    if (!player) return;
    if (player.state !== 'dead') {
      this.deathTimer = 0;
      return;
    }
    this.deathTimer += dt;
    if (this.deathTimer >= DEATH_RESPAWN_DELAY) {
      this.deathTimer = 0;
      // 切到比奇城（若已在比奇城则只复活）
      if (this.mapManager && this.mapManager.currentMapId !== RESPAWN_MAP) {
        this.mapManager.loadMap(RESPAWN_MAP, RESPAWN_TX, RESPAWN_TY, this);
      }
      // 在复活点复活
      const map = this.mapManager ? this.mapManager.currentMap : null;
      if (map) {
        player.respawn(map, RESPAWN_TX, RESPAWN_TY);
        // 同步到场景
        if (this.scene) this.scene.player = player;
        // 相机立即贴合
        if (this.camera) {
          this.camera.follow({ x: player.wx, y: player.wy }, 1);
        }
      }
    }
  },

  // ===== 主循环：渲染 =====

  /** 每帧渲染 */
  render(interpolation) {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    if (this.perf) { this.perf.resetDrawCalls(); this.perf.beginRender(); }
    switch (this.state) {
      case GameState.LOADING:
        if (this.loadingScreen) this.loadingScreen.render(ctx);
        else {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
        }
        break;

      case GameState.MAIN_MENU:
        if (this.mainMenu) this.mainMenu.render(ctx);
        else {
          ctx.fillStyle = '#0a1a3a';
          ctx.fillRect(0, 0, w, h);
        }
        break;

      case GameState.CHARACTER_CREATE:
        if (this.characterCreateMenu) this.characterCreateMenu.render(ctx);
        else {
          ctx.fillStyle = '#081020';
          ctx.fillRect(0, 0, w, h);
        }
        break;

      case GameState.PLAYING:
        this._renderPlaying(ctx);
        break;

      case GameState.PAUSED:
        // 先画 PLAYING 冻结画面，再叠加暂停菜单
        this._renderPlaying(ctx);
        if (this.pauseMenu) this.pauseMenu.render(ctx);
        break;
    }
    if (this.perf) this.perf.endRender();
  },

  /** 渲染 PLAYING 画面 */
  _renderPlaying(ctx) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // 黑色背景
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    if (!this.scene || !this.camera) return;

    // 1. 场景渲染（地图地面层 + 实体 Y 排序）
    try {
      this.scene.render(ctx, this.camera, this.assets);
    } catch (e) {
      console.warn('场景渲染异常:', e);
    }

    // 2. 技能系统短时实体（特效 / 飘字 / 火墙）
    this._renderSkillSystem(ctx);

    // 3. UI（HUD + 窗口）
    if (this.ui && this.player) {
      try {
        const map = this.mapManager ? this.mapManager.currentMap : null;
        this.ui.render(ctx, this.player, this.camera, map);
      } catch (e) {
        console.warn('UI 渲染异常:', e);
      }
    }

    // 4. 死亡复活倒计时遮罩
    if (this.player && this.player.state === 'dead' && this.deathTimer > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ff5050';
      ctx.font = 'bold 38px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('您已死亡', w / 2, h / 2 - 30);
      ctx.fillStyle = '#ffe9a8';
      ctx.font = '22px "Microsoft YaHei", sans-serif';
      const remain = Math.max(0, DEATH_RESPAWN_DELAY - this.deathTimer);
      ctx.fillText(`${Math.ceil(remain)} 秒后在比奇城复活`, w / 2, h / 2 + 20);
    }

    // 5. 右上角 FPS / 性能调试
    if (this.perf) {
      // 调试模式：显示 PerfMonitor 完整报告
      const r = this.perf.getReport();
      ctx.fillStyle = '#7f8c6a';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`FPS ${r.fps}`, w - 8, 8);
      ctx.fillText(`upd ${r.updateTimeMs.toFixed(2)}ms`, w - 8, 24);
      ctx.fillText(`rnd ${r.renderTimeMs.toFixed(2)}ms`, w - 8, 40);
      ctx.fillText(`ent ${r.entityCount}`, w - 8, 56);
      ctx.fillText(`draw ${r.drawCalls}`, w - 8, 72);
    } else if (this.loop) {
      ctx.fillStyle = '#7f8c6a';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(`FPS ${this.loop.getFPS()}`, w - 8, 8);
    }
  },

  /**
   * 渲染 SkillSystem 自持的短时实体（特效 / 飘字 / 火墙）
   * 这些实体无 render 方法，仅提供 getRenderInfo()，需自行按数据绘制
   */
  _renderSkillSystem(ctx) {
    const ss = this.skillSystem;
    if (!ss || !this.camera) return;

    // 火墙：在覆盖瓦片上绘制半透明红色椭圆
    try {
      for (const fw of ss.getFireWalls()) {
        if (!fw || !fw.alive) continue;
        const info = fw.getRenderInfo();
        for (const t of info.tiles) {
          const s = this.camera.worldToScreen(t.worldX, t.worldY);
          ctx.save();
          ctx.fillStyle = 'rgba(255,80,0,0.5)';
          ctx.beginPath();
          ctx.ellipse(s.x, s.y, 28, 14, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,180,80,0.8)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
        }
      }
    } catch (e) { /* 火墙渲染异常忽略 */ }

    // 特效：按 type / color / radius 绘制简单圆环
    try {
      for (const e of ss.getEffects()) {
        if (!e || !e.alive) continue;
        const info = e.getRenderInfo();
        const s = this.camera.worldToScreen(info.worldX, info.worldY);
        const radiusPx = (info.radius || 1) * 32; // 1 瓦片半径约 32 像素
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - info.progress);
        ctx.strokeStyle = info.color || '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, radiusPx, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = info.color || '#ffffff';
        ctx.globalAlpha = Math.max(0, 0.3 * (1 - info.progress));
        ctx.fill();
        ctx.restore();
      }
    } catch (e) { /* 特效渲染异常忽略 */ }

    // 飘字：在目标头顶绘制伤害数字
    try {
      for (const t of ss.getDamageTexts()) {
        if (!t || !t.alive) continue;
        const info = t.getRenderInfo();
        const s = this.camera.worldToScreen(info.worldX, info.worldY);
        ctx.save();
        ctx.globalAlpha = info.alpha;
        ctx.fillStyle = info.color || '#ffffff';
        ctx.font = `${info.crit ? 'bold ' : ''}${info.size}px "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // 描边增强可读性
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 3;
        ctx.strokeText(info.text, s.x, s.y - 50);
        ctx.fillText(info.text, s.x, s.y - 50);
        ctx.restore();
      }
    } catch (e) { /* 飘字渲染异常忽略 */ }
  },
};

// ===== 启动 =====
// DOM 就绪后初始化（脚本以 module 加载，已是 deferred，DOM 此时已解析完成）
Game.init();
// 暴露到 window 便于调试
window.game = Game;
window.GameState = GameState;

// 启动主循环
Game.loop.start();
