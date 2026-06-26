/**
 * main.js — 游戏主入口
 *
 * 职责：
 * - 初始化 Canvas、GameLoop、AssetLoader、Input、Camera
 * - 维护游戏状态机：LOADING / MAIN_MENU / CHARACTER_CREATE / PLAYING / PAUSED
 * - 启动时预加载资源，完成后进入主菜单
 * - 提供统一的 changeState(state, payload) 切换入口
 * - 当前为骨架：主菜单为蓝色背景 + HTML 按钮；PLAYING 为黑色背景 + "加载中..." 占位文字
 *
 * 后续 Task 将在 PLAYING 状态接入地图、角色、战斗等实际内容。
 */

import { GameLoop } from './engine/GameLoop.js';
import { AssetLoader } from './engine/AssetLoader.js';
import { Input } from './engine/Input.js';
import { Camera } from './engine/Camera.js';

// ===== 游戏状态枚举 =====
const GameState = {
  LOADING: 'LOADING',
  MAIN_MENU: 'MAIN_MENU',
  CHARACTER_CREATE: 'CHARACTER_CREATE',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
};

/** Game 单例：集中管理所有子系统与状态 */
const Game = {
  // ----- 核心子系统 -----
  canvas: null,
  ctx: null,
  loop: null,
  assets: null,
  input: null,
  camera: null,

  // ----- 状态 -----
  state: GameState.LOADING,
  /** 状态切换时携带的负载（如所选职业） */
  payload: null,
  /** 选定职业（PLAYING 后由 CHARACTER_CREATE 写入） */
  selectedClass: null,

  /** DOM 缓存 */
  dom: {
    loading: null,
    mainMenu: null,
    characterCreate: null,
    hud: null,
  },

  // ===== 生命周期 =====

  /** 初始化并启动 */
  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');

    // 缓存 DOM
    this.dom.loading = document.getElementById('loading');
    this.dom.mainMenu = document.getElementById('main-menu');
    this.dom.characterCreate = document.getElementById('character-create');
    this.dom.hud = document.getElementById('hud');

    // 子系统
    this.resizeCanvas();
    this.assets = new AssetLoader();
    this.input = new Input(this.canvas);
    // 视口使用 CSS 像素，与渲染层 setTransform(dpr) 后的坐标系一致
    this.camera = new Camera(window.innerWidth, window.innerHeight);

    // 主循环：固定步长更新 + rAF 渲染
    this.loop = new GameLoop(
      (dt) => this.update(dt),
      (interp) => this.render(interp)
    );

    // 窗口尺寸变化
    window.addEventListener('resize', () => this.resizeCanvas());

    // 绑定 UI 事件
    this._bindUI();

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

  /** 资源预加载：骨架阶段无外部资源，仅生成占位图演示流程 */
  _preloadAssets() {
    this.assets.onProgress = (percent) => {
      this.dom.loading.textContent = `加载中... ${percent}%`;
    };

    // 骨架阶段 manifest 为空；后续 Task 在此填入真实资源清单
    const manifest = { images: {}, jsons: {} };

    this.assets
      .preload(manifest)
      .then(() => {
        // 生成若干占位精灵，供后续渲染模块直接取用
        this._generatePlaceholders();
        this.changeState(GameState.MAIN_MENU);
      })
      .catch((err) => {
        console.error('资源加载失败:', err);
        this.dom.loading.textContent = '资源加载失败，请刷新重试';
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
    // 离开旧状态
    this._onExitState(this.state);

    this.state = state;
    this.payload = payload || null;

    // 进入新状态
    this._onEnterState(state, payload);

    console.log(`[Game] 状态切换 -> ${state}`, payload || '');
  },

  _onEnterState(state, payload) {
    switch (state) {
      case GameState.LOADING:
        this._showOverlay(this.dom.loading);
        this._hideOverlay(this.dom.mainMenu);
        this._hideOverlay(this.dom.characterCreate);
        this._hideOverlay(this.dom.hud);
        break;
      case GameState.MAIN_MENU:
        this._hideOverlay(this.dom.loading);
        this._showOverlay(this.dom.mainMenu);
        this._hideOverlay(this.dom.characterCreate);
        this._hideOverlay(this.dom.hud);
        break;
      case GameState.CHARACTER_CREATE:
        this._hideOverlay(this.dom.mainMenu);
        this._showOverlay(this.dom.characterCreate);
        break;
      case GameState.PLAYING:
        this._hideOverlay(this.dom.mainMenu);
        this._hideOverlay(this.dom.characterCreate);
        this._hideOverlay(this.dom.loading);
        this._showOverlay(this.dom.hud);
        this.selectedClass = payload ? payload.classId : null;
        break;
      case GameState.PAUSED:
        // 暂停仅作状态标记，UI 由后续 Task 接入
        break;
    }
  },

  _onExitState(state) {
    // 占位：后续可在此做状态清理（如释放监听、停止子循环）
  },

  // ===== UI 绑定 =====

  _bindUI() {
    // 新游戏按钮 -> 进入创建角色
    document.getElementById('btn-new-game').addEventListener('click', () => {
      this.changeState(GameState.CHARACTER_CREATE);
    });

    // 创建角色：职业卡片 -> 进入游戏
    const cards = this.dom.characterCreate.querySelectorAll('.class-card');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const classId = card.getAttribute('data-class');
        this.changeState(GameState.PLAYING, { classId });
      });
    });

    // 返回主菜单
    document.getElementById('btn-back-menu').addEventListener('click', () => {
      this.changeState(GameState.MAIN_MENU);
    });

    // ESC 暂停/恢复（PLAYING <-> PAUSED）
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if (this.state === GameState.PLAYING) {
          this.changeState(GameState.PAUSED);
        } else if (this.state === GameState.PAUSED) {
          this.changeState(GameState.PLAYING, { classId: this.selectedClass });
        }
      }
    });
  },

  _showOverlay(el) {
    if (!el) return;
    el.classList.remove('hidden');
    el.classList.add('active');
  },

  _hideOverlay(el) {
    if (!el) return;
    el.classList.add('hidden');
    el.classList.remove('active');
  },

  // ===== 主循环回调 =====

  /** 每个固定步长的逻辑更新 */
  update(dt) {
    if (this.state === GameState.PLAYING) {
      // 占位：后续 Task 在此更新角色/怪物/AI/战斗
      // 示例：把鼠标屏幕坐标转世界坐标回写到 input，便于交互模块读取
      const m = this.input.getMouse();
      const w = this.camera.screenToWorld(m.x, m.y);
      m.worldX = w.x;
      m.worldY = w.y;
    }

    // 每帧末尾重置输入瞬时状态
    this.input.update();
  },

  /** 每帧渲染 */
  render(interpolation) {
    const ctx = this.ctx;
    const w = window.innerWidth;
    const h = window.innerHeight;

    switch (this.state) {
      case GameState.LOADING:
        // 加载由 DOM 覆盖层显示，canvas 仅清黑
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        break;

      case GameState.MAIN_MENU:
        // 蓝色背景（与 CSS 渐变一致），实际菜单为 HTML 覆盖层
        ctx.fillStyle = '#0a2a5e';
        ctx.fillRect(0, 0, w, h);
        break;

      case GameState.CHARACTER_CREATE:
        ctx.fillStyle = '#081020';
        ctx.fillRect(0, 0, w, h);
        break;

      case GameState.PLAYING:
        // 占位 PLAYING：黑色背景 + 居中 "加载中..." 文字
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#e8d8a0';
        ctx.font = '28px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('加载中...', w / 2, h / 2);
        // 右上角显示 FPS，便于调试
        ctx.fillStyle = '#7f8c6a';
        ctx.font = '14px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText(`FPS ${this.loop.getFPS()}`, w - 10, 10);
        break;

      case GameState.PAUSED:
        // 暂停：复用 PLAYING 画面并叠加半透明遮罩
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffe9a8';
        ctx.font = '32px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('已暂停  按 ESC 继续', w / 2, h / 2);
        break;
    }
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
