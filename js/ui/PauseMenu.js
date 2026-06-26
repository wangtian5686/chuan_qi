/**
 * PauseMenu.js — 暂停菜单（Canvas 绘制）
 *
 * 职责：
 * - 游戏暂停时显示半透明黑色遮罩 + 居中菜单项列表
 * - 菜单项：继续游戏 / 保存游戏 / 读档 / 设置 / 返回主菜单
 * - 鼠标 hover 高亮、点击触发对应动作
 * - 上下方向键切换选中项，回车确认
 *
 * 与 Game 的通信：通过 game 方法调用
 * - "继续游戏": 本类 hide()（game 据此恢复运行）
 * - "保存游戏": game.openSaveWindow('save')
 * - "读档": game.openSaveWindow('load')
 * - "设置": onSettings() 回调
 * - "返回主菜单": game.returnToMainMenu()
 *
 * 注：ESC 暂停/恢复由 InputHandler 的 pause 绑定统一处理（game.togglePause），
 * 本类不再单独监听 ESC，避免与全局暂停切换重复触发。
 *
 * 坐标约定：使用 canvas 的 CSS 像素尺寸（与 setTransform(dpr) 后的绘图坐标系一致）。
 */

export class PauseMenu {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} game Game 单例（提供 openSaveWindow / returnToMainMenu 等方法）
   */
  constructor(canvas, input, game) {
    this.canvas = canvas;
    this.input = input;
    this.game = game;

    /** 是否可见 */
    this.visible = false;
    /** 菜单项文本 */
    this.items = ['继续游戏', '保存游戏', '读档', '设置', '返回主菜单'];
    /** 当前选中项索引 */
    this.selectedIndex = 0;
    /** 鼠标悬停项索引（-1 表示无） */
    this.hoverIndex = -1;

    /** 由 Game 注入的设置回调（game 可能未实现设置界面） */
    this.onSettings = null;

    /** 最近一次布局结果，供 update 命中检测复用 */
    this._layout = null;
  }

  /** 显示暂停菜单并重置选中项 */
  show() {
    this.visible = true;
    this.selectedIndex = 0;
    this.hoverIndex = -1;
  }

  /** 隐藏暂停菜单 */
  hide() {
    this.visible = false;
  }

  /** 切换显隐 */
  toggle() {
    if (this.visible) this.hide();
    else this.show();
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
   * 计算当前帧布局：面板矩形与各菜单项矩形
   * @returns {object}
   */
  _computeLayout() {
    const { w: vw, h: vh } = this._cssSize();

    const itemW = Math.min(280, vw - 80);
    const itemH = 46;
    const gap = 12;
    const titleH = 56;
    const pad = 20;
    const totalH = titleH + this.items.length * itemH + (this.items.length - 1) * gap + pad * 2;

    const panelW = itemW + pad * 2;
    const panelH = totalH;
    const panelX = Math.floor((vw - panelW) / 2);
    const panelY = Math.floor((vh - panelH) / 2);

    const items = this.items.map((label, i) => ({
      label,
      index: i,
      rect: {
        x: panelX + pad,
        y: panelY + titleH + pad + i * (itemH + gap),
        w: itemW,
        h: itemH,
      },
    }));

    return { vw, vh, panel: { x: panelX, y: panelY, w: panelW, h: panelH }, items };
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
    if (this.hoverIndex >= 0) {
      this.selectedIndex = this.hoverIndex;
    }

    // 上下方向键切换选中项
    if (inp.wasKeyJustPressed && inp.wasKeyJustPressed('ArrowUp')) {
      this._moveSelection(-1);
    }
    if (inp.wasKeyJustPressed && inp.wasKeyJustPressed('ArrowDown')) {
      this._moveSelection(1);
    }

    // 回车确认
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

  /** 上下方向键移动选中项 */
  _moveSelection(dir) {
    const n = this.items.length;
    this.selectedIndex = (this.selectedIndex + dir + n) % n;
  }

  /**
   * 触发指定菜单项
   * @param {number} index
   */
  _activate(index) {
    if (index < 0 || index >= this.items.length) return;
    const label = this.items[index];
    const game = this.game;
    switch (label) {
      case '继续游戏':
        this.hide();
        break;
      case '保存游戏':
        if (game && typeof game.openSaveWindow === 'function') game.openSaveWindow('save');
        break;
      case '读档':
        if (game && typeof game.openSaveWindow === 'function') game.openSaveWindow('load');
        break;
      case '设置':
        if (typeof this.onSettings === 'function') this.onSettings();
        break;
      case '返回主菜单':
        if (game && typeof game.returnToMainMenu === 'function') game.returnToMainMenu();
        break;
    }
  }

  // ===== 渲染 =====

  /**
   * 绘制暂停菜单
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.visible) return;
    const layout = this._computeLayout();
    this._layout = layout;
    const { vw, vh, panel, items } = layout;

    // 半透明黑色全屏遮罩
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, vw, vh);

    // 面板背景
    ctx.fillStyle = 'rgba(8,12,24,0.95)';
    this._roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 10);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6a5a2a';
    ctx.stroke();

    // 标题
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 26px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('已暂停', panel.x + panel.w / 2, panel.y + 30);

    // 菜单项
    for (const it of items) {
      this._renderItem(ctx, it);
    }
  }

  /** 绘制单个菜单项 */
  _renderItem(ctx, it) {
    const { rect, index } = it;
    const selected = this.selectedIndex === index;
    const hover = this.hoverIndex === index;

    if (selected || hover) ctx.fillStyle = 'rgba(200,144,42,0.4)';
    else ctx.fillStyle = 'rgba(255,255,255,0.04)';
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 6);
    ctx.fill();

    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? '#ffe9a8' : 'rgba(255,233,168,0.3)';
    ctx.stroke();

    ctx.fillStyle = selected ? '#ffe9a8' : '#e8d8a0';
    ctx.font = '19px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.label, rect.x + rect.w / 2, rect.y + rect.h / 2);

    // 选中项左侧标记
    if (selected) {
      ctx.fillStyle = '#ffd060';
      ctx.beginPath();
      ctx.moveTo(rect.x + 8, rect.y + rect.h / 2);
      ctx.lineTo(rect.x + 16, rect.y + rect.h / 2 - 5);
      ctx.lineTo(rect.x + 16, rect.y + rect.h / 2 + 5);
      ctx.closePath();
      ctx.fill();
    }
  }
}

export default PauseMenu;
