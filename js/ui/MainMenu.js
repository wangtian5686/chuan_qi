/**
 * MainMenu.js — 主菜单（Canvas 绘制）
 *
 * 职责：
 * - 全屏深色渐变背景 + 占位 LOGO + 标题"热血传奇 1:1 复刻"
 * - 菜单项：新游戏 / 继续游戏 / 设置 / 关于
 * - 鼠标 hover 高亮、点击或回车确认触发对应回调
 * - 上下方向键切换选中项
 * - "继续游戏"在无任何存档时灰显且不可触发
 *
 * 与 Game 的通信：通过回调 onNewGame / onContinue / onSettings / onAbout，
 * 由 main.js 在联调时注入。
 *
 * 坐标约定：使用 canvas 的 CSS 像素尺寸（与 setTransform(dpr) 后的绘图坐标系一致）。
 */

/** 菜单版本号（底部显示） */
const VERSION = 'v0.1.0';

export class MainMenu {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} saveManager SaveManager 实例（用于判断是否有存档）
   */
  constructor(canvas, input, saveManager) {
    this.canvas = canvas;
    this.input = input;
    this.saveManager = saveManager;

    /** 是否可见 */
    this.visible = false;
    /** 菜单项文本 */
    this.items = ['新游戏', '继续游戏', '设置', '关于'];
    /** 当前选中项索引 */
    this.selectedIndex = 0;
    /** 鼠标悬停项索引（-1 表示无） */
    this.hoverIndex = -1;

    /** 由 Game 注入的回调 */
    this.onNewGame = null; // () => void
    this.onContinue = null; // () => void
    this.onSettings = null; // () => void
    this.onAbout = null; // () => void

    /** 最近一次布局结果，供 update 命中检测复用 */
    this._layout = null;
  }

  /** 显示菜单并重置选中项 */
  show() {
    this.visible = true;
    this.selectedIndex = 0;
    this.hoverIndex = -1;
  }

  /** 隐藏菜单 */
  hide() {
    this.visible = false;
  }

  // ===== 工具 =====

  /** 取画布 CSS 像素尺寸 */
  _cssSize() {
    const w = this.canvas.clientWidth || this.canvas.width || window.innerWidth;
    const h = this.canvas.clientHeight || this.canvas.height || window.innerHeight;
    return { w, h };
  }

  /** 矩形命中检测 */
  _hit(rect, x, y) {
    return (
      x >= rect.x && x <= rect.x + rect.w &&
      y >= rect.y && y <= rect.y + rect.h
    );
  }

  /** 圆角矩形路径 */
  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /**
   * 是否存在任意存档（auto 或 slot1~5）
   * saveManager 缺失时返回 false
   * @returns {boolean}
   */
  _hasAnySave() {
    const sm = this.saveManager;
    if (!sm) return false;
    // 优先用 getAllSlotInfos（一次性取全部）
    if (typeof sm.getAllSlotInfos === 'function') {
      const infos = sm.getAllSlotInfos();
      for (const info of infos) {
        if (info && info.exists) return true;
      }
      return false;
    }
    // 回退：逐个 hasSave 判断
    if (typeof sm.hasSave !== 'function') return false;
    const ids = ['auto', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5'];
    for (const id of ids) {
      if (sm.hasSave(id)) return true;
    }
    return false;
  }

  /**
   * 指定菜单项当前是否可用（灰显判断）
   * @param {number} index
   * @returns {boolean}
   */
  _isItemEnabled(index) {
    if (this.items[index] === '继续游戏') {
      return this._hasAnySave();
    }
    return true;
  }

  /**
   * 计算当前帧布局：标题区与各菜单项矩形
   * @returns {object}
   */
  _computeLayout() {
    const { w: vw, h: vh } = this._cssSize();

    // 菜单项尺寸
    const itemW = Math.min(300, vw - 80);
    const itemH = 50;
    const gap = 14;
    const totalH = this.items.length * itemH + (this.items.length - 1) * gap;

    // 菜单整体垂直居中偏下，给标题留空间
    const startY = Math.floor((vh - totalH) / 2 + 40);
    const cx = Math.floor(vw / 2);

    const items = this.items.map((label, i) => ({
      label,
      index: i,
      rect: {
        x: Math.floor(cx - itemW / 2),
        y: startY + i * (itemH + gap),
        w: itemW,
        h: itemH,
      },
    }));

    return { vw, vh, cx, items };
  }

  // ===== 更新 =====

  /**
   * 每帧更新交互
   * @param {number} dt 秒（当前未使用，保留接口）
   * @param {object} input Input 实例
   */
  update(dt, input) {
    if (!this.visible) return;
    const inp = input || this.input;
    this._layout = this._computeLayout();

    const mouse = inp.getMouse ? inp.getMouse() : inp.mouse;
    const mx = mouse.x;
    const my = mouse.y;

    // 鼠标悬停检测
    this.hoverIndex = -1;
    for (const it of this._layout.items) {
      if (this._hit(it.rect, mx, my)) {
        this.hoverIndex = it.index;
        break;
      }
    }
    // 悬停时同步选中项（仅对可用项）
    if (this.hoverIndex >= 0 && this._isItemEnabled(this.hoverIndex)) {
      this.selectedIndex = this.hoverIndex;
    }

    // 上下方向键切换选中项（跳过灰显项）
    if (inp.wasKeyJustPressed && inp.wasKeyJustPressed('ArrowUp')) {
      this._moveSelection(-1);
    }
    if (inp.wasKeyJustPressed && inp.wasKeyJustPressed('ArrowDown')) {
      this._moveSelection(1);
    }

    // 回车确认当前选中项
    if (inp.wasKeyJustPressed && inp.wasKeyJustPressed('Enter')) {
      this._activate(this.selectedIndex);
      return;
    }

    // 鼠标点击确认
    if (mouse.leftPressed === true) {
      for (const it of this._layout.items) {
        if (this._hit(it.rect, mx, my)) {
          this._activate(it.index);
          return;
        }
      }
    }
  }

  /**
   * 上下方向键移动选中项，跳过灰显项
   * @param {number} dir -1 上 / +1 下
   */
  _moveSelection(dir) {
    const n = this.items.length;
    let idx = this.selectedIndex;
    for (let i = 0; i < n; i++) {
      idx = (idx + dir + n) % n;
      if (this._isItemEnabled(idx)) {
        this.selectedIndex = idx;
        return;
      }
    }
  }

  /**
   * 触发指定菜单项的回调（灰显项忽略）
   * @param {number} index
   */
  _activate(index) {
    if (index < 0 || index >= this.items.length) return;
    if (!this._isItemEnabled(index)) return;
    const label = this.items[index];
    switch (label) {
      case '新游戏':
        if (typeof this.onNewGame === 'function') this.onNewGame();
        break;
      case '继续游戏':
        if (typeof this.onContinue === 'function') this.onContinue();
        break;
      case '设置':
        if (typeof this.onSettings === 'function') this.onSettings();
        break;
      case '关于':
        if (typeof this.onAbout === 'function') this.onAbout();
        break;
    }
  }

  // ===== 渲染 =====

  /**
   * 绘制主菜单
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.visible) return;
    const layout = this._computeLayout();
    this._layout = layout;
    const { vw, vh, cx } = layout;

    // 深色渐变背景
    const grad = ctx.createLinearGradient(0, 0, 0, vh);
    grad.addColorStop(0, '#0a1a3a');
    grad.addColorStop(0.5, '#1a2a5a');
    grad.addColorStop(1, '#0a1a3a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, vw, vh);

    // 占位 LOGO（金色描边圆形 + 内部剑形占位）
    this._drawLogo(ctx, cx, Math.floor(vh * 0.18));

    // 标题
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 48px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;
    ctx.fillText('热血传奇', cx, Math.floor(vh * 0.34));
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 副标题
    ctx.fillStyle = '#b8d4ff';
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.fillText('1 : 1 复刻', cx, Math.floor(vh * 0.34) + 38);

    // 菜单项
    for (const it of layout.items) {
      this._renderItem(ctx, it);
    }

    // 底部版本号
    ctx.fillStyle = '#6a7a8a';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(VERSION, cx, vh - 16);
  }

  /** 绘制占位 LOGO */
  _drawLogo(ctx, cx, cy) {
    const r = 36;
    ctx.save();
    // 外圈
    ctx.strokeStyle = '#c8902a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    // 内圈
    ctx.strokeStyle = '#6a5a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 6, 0, Math.PI * 2);
    ctx.stroke();
    // 内部剑形占位（竖线 + 横档）
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 18);
    ctx.lineTo(cx, cy + 18);
    ctx.moveTo(cx - 10, cy - 4);
    ctx.lineTo(cx + 10, cy - 4);
    ctx.stroke();
    ctx.restore();
  }

  /** 绘制单个菜单项 */
  _renderItem(ctx, it) {
    const { rect, index } = it;
    const selected = this.selectedIndex === index;
    const hover = this.hoverIndex === index;
    const enabled = this._isItemEnabled(index);

    // 背景与边框
    if (!enabled) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
    } else if (selected || hover) {
      ctx.fillStyle = 'rgba(200,144,42,0.35)';
    } else {
      ctx.fillStyle = 'rgba(20,40,80,0.55)';
    }
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 8);
    ctx.fill();

    ctx.lineWidth = selected ? 2 : 1;
    if (!enabled) ctx.strokeStyle = 'rgba(255,233,168,0.15)';
    else if (selected) ctx.strokeStyle = '#ffe9a8';
    else ctx.strokeStyle = 'rgba(255,233,168,0.4)';
    ctx.stroke();

    // 文字
    if (!enabled) ctx.fillStyle = '#5a5448';
    else if (selected) ctx.fillStyle = '#ffe9a8';
    else ctx.fillStyle = '#e8d8a0';
    ctx.font = '22px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.label, rect.x + rect.w / 2, rect.y + rect.h / 2);

    // 选中项左侧标记
    if (selected && enabled) {
      ctx.fillStyle = '#ffd060';
      ctx.beginPath();
      ctx.moveTo(rect.x + 10, rect.y + rect.h / 2);
      ctx.lineTo(rect.x + 18, rect.y + rect.h / 2 - 6);
      ctx.lineTo(rect.x + 18, rect.y + rect.h / 2 + 6);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export default MainMenu;
