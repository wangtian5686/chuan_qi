/**
 * Tooltip.js — 通用 tooltip
 *
 * 职责：
 * - 在指定屏幕坐标绘制多行文本框，供 HUD / 窗口复用
 * - 支持 string（按 \n 拆行）或 {text,color,bold}[] 两种输入
 * - 自动测量文本宽度，靠近视口边缘时翻转方向
 *
 * 约定：坐标为 canvas 内 CSS 像素，与渲染层 setTransform(dpr) 后一致。
 */

/** 默认字体 */
const FONT = '12px monospace';
/** 行高 */
const LINE_H = 15;
/** 内边距 */
const PAD_X = 8;
const PAD_Y = 6;

export class Tooltip {
  constructor() {
    /** 是否可见 */
    this.visible = false;
    /** @type {string|Array<{text:string,color?:string,bold?:boolean}>} */
    this.text = '';
    /** 屏幕坐标 X */
    this.x = 0;
    /** 屏幕坐标 Y */
    this.y = 0;
    /** 关联的 canvas（用于边界检测），由使用方按需赋值 */
    this.canvas = null;
  }

  /**
   * 显示 tooltip
   * @param {string|Array} text 文本（字符串或行数组）
   * @param {number} x 屏幕坐标 X
   * @param {number} y 屏幕坐标 Y
   */
  show(text, x, y) {
    this.text = text;
    this.x = x;
    this.y = y;
    this.visible = true;
  }

  /** 隐藏 tooltip */
  hide() {
    this.visible = false;
    this.text = '';
  }

  /** 把 text 标准化为行数组 */
  _lines() {
    if (typeof this.text === 'string') {
      return this.text.split('\n').map((t) => ({ text: t }));
    }
    if (Array.isArray(this.text)) {
      return this.text.map((l) => ({
        text: l.text != null ? String(l.text) : '',
        color: l.color || '#e8d8a8',
        bold: !!l.bold,
      }));
    }
    return [];
  }

  /**
   * 绘制 tooltip
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.visible) return;
    const lines = this._lines();
    if (lines.length === 0) return;

    ctx.save();
    ctx.font = FONT;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    // 测量最大宽度
    let maxW = 0;
    for (const l of lines) {
      const w = ctx.measureText(l.text).width;
      if (w > maxW) maxW = w;
    }
    const boxW = Math.ceil(maxW) + PAD_X * 2;
    const boxH = lines.length * LINE_H + PAD_Y * 2;

    // 视口尺寸（CSS 像素）
    const cw = this.canvas
      ? (this.canvas.clientWidth || this.canvas.width)
      : 9999;
    const ch = this.canvas
      ? (this.canvas.clientHeight || this.canvas.height)
      : 9999;

    // 定位：默认在鼠标右下，靠近边缘翻转
    let bx = this.x + 14;
    let by = this.y + 14;
    if (bx + boxW > cw) bx = this.x - boxW - 14;
    if (by + boxH > ch) by = this.y - boxH - 14;
    bx = Math.max(2, bx);
    by = Math.max(2, by);

    // 背景
    ctx.fillStyle = 'rgba(10, 8, 14, 0.96)';
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

    // 文本
    let ty = by + PAD_Y;
    for (const l of lines) {
      ctx.fillStyle = l.color || '#e8d8a8';
      ctx.font = l.bold ? 'bold ' + FONT : FONT;
      ctx.fillText(l.text, bx + PAD_X, ty);
      ty += LINE_H;
    }
    ctx.restore();
  }
}

export default Tooltip;
