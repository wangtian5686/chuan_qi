/**
 * DialogBox.js — 通用对话 / 提示框
 *
 * 用于展示一段文本与若干选项按钮，点击选项触发其 action 回调后关闭。
 * options 为 [{label, action?, close?}]：close 缺省为 true（点击后关闭）。
 *
 * 交互约定（与其他窗口一致）：
 * - 鼠标坐标取自 input.getMouse()（canvas 内 CSS 像素）
 * - update() 返回 true 表示本次点击被窗口消费
 */

const PAD = 12;
const TITLE_H = 24;
const OPTION_H = 30;
const OPTION_GAP = 6;
const CLOSE_SIZE = 18;
/** 文本区单行高度 */
const LINE_H = 18;
/** 文本区每行粗略字符容量（用于估算高度） */
const CHARS_PER_LINE = 26;

export class DialogBox {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {string} text 对话文本
   * @param {Array<{label:string, action?:function, close?:boolean}>} options 选项列表
   */
  constructor(canvas, input, text, options) {
    this.canvas = canvas;
    this.input = input;
    this.text = text || '';
    this.options = Array.isArray(options) ? options.slice() : [];

    this.visible = false;
    this.w = 340;
    // 高度按文本行数与选项数自适应
    this.h = TITLE_H + PAD * 2 + this._textHeight() +
      this.options.length * (OPTION_H + OPTION_GAP) + PAD;

    this.x = 0;
    this.y = 0;
    this._layout();
  }

  /** 估算文本区高度（按字符数粗略折行） */
  _textHeight() {
    const lines = Math.max(1, Math.ceil((this.text || '').length / CHARS_PER_LINE));
    return lines * LINE_H;
  }

  _layout() {
    // 居中显示
    if (this.canvas) {
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      const cw = this.canvas.width / dpr;
      const ch = this.canvas.height / dpr;
      this.x = Math.max(0, (cw - this.w) / 2);
      this.y = Math.max(0, (ch - this.h) / 2);
    }
    this.textY = this.y + TITLE_H + PAD;
    this.optionsY = this.textY + this._textHeight() + PAD;
    this.closeX = this.x + this.w - CLOSE_SIZE - PAD;
    this.closeY = this.y + (TITLE_H - CLOSE_SIZE) / 2;
  }

  show() { this.visible = true; this._layout(); }
  hide() { this.visible = false; }

  _isInWindow(mx, my) {
    return mx >= this.x && mx <= this.x + this.w && my >= this.y && my <= this.y + this.h;
  }

  _inCloseBtn(mx, my) {
    return mx >= this.closeX && mx <= this.closeX + CLOSE_SIZE &&
      my >= this.closeY && my <= this.closeY + CLOSE_SIZE;
  }

  _getOptionAt(mx, my) {
    if (mx < this.x + PAD || mx > this.x + this.w - PAD) return -1;
    for (let i = 0; i < this.options.length; i++) {
      const oy = this.optionsY + i * (OPTION_H + OPTION_GAP);
      if (my >= oy && my <= oy + OPTION_H) return i;
    }
    return -1;
  }

  /**
   * 每帧更新交互
   * @returns {boolean} 是否消费了本帧鼠标点击
   */
  update(dt, input) {
    if (!this.visible) return false;
    const inp = input || this.input;
    const mouse = inp.getMouse();
    const mx = mouse.x, my = mouse.y;
    const inWindow = this._isInWindow(mx, my);

    let consumed = false;
    if (mouse.leftPressed && inWindow) {
      if (this._inCloseBtn(mx, my)) { this.hide(); return true; }
      const idx = this._getOptionAt(mx, my);
      if (idx >= 0) {
        this._select(idx);
        consumed = true;
      } else {
        consumed = true;
      }
    }
    return consumed;
  }

  _select(idx) {
    const opt = this.options[idx];
    if (!opt) return;
    const close = opt.close !== false;
    if (close) this.hide();
    if (typeof opt.action === 'function') opt.action();
  }

  /** 绘制 */
  render(ctx) {
    if (!this.visible) return;
    this._layout();
    ctx.save();
    // 背景
    ctx.fillStyle = 'rgba(20, 18, 26, 0.95)';
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 2;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeRect(this.x, this.y, this.w, this.h);

    // 标题栏
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(this.x, this.y, this.w, TITLE_H);
    ctx.fillStyle = '#e8d8a8';
    ctx.font = 'bold 14px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('提示', this.x + PAD, this.y + TITLE_H / 2);

    this._drawCloseButton(ctx);

    // 文本（按宽度折行）
    ctx.fillStyle = '#e8d8a8';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    this._drawWrappedText(ctx, this.text, this.x + PAD, this.textY, this.w - PAD * 2, LINE_H);

    // 选项按钮
    for (let i = 0; i < this.options.length; i++) {
      const opt = this.options[i];
      const oy = this.optionsY + i * (OPTION_H + OPTION_GAP);
      ctx.fillStyle = '#2a2218';
      ctx.fillRect(this.x + PAD, oy, this.w - PAD * 2, OPTION_H);
      ctx.strokeStyle = '#6a5a3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x + PAD + 0.5, oy + 0.5, this.w - PAD * 2 - 1, OPTION_H - 1);
      ctx.fillStyle = '#ffe060';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opt.label || '', this.x + this.w / 2, oy + OPTION_H / 2);
    }
    ctx.restore();
  }

  /** 按像素宽度折行绘制文本 */
  _drawWrappedText(ctx, text, x, y, maxW, lineH) {
    if (!text) return;
    let line = '';
    let cy = y;
    const flush = () => { ctx.fillText(line, x, cy); cy += lineH; line = ''; };
    for (const ch of text) {
      if (ch === '\n') { flush(); continue; }
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        flush();
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) flush();
  }

  _drawCloseButton(ctx) {
    const x = this.closeX, y = this.closeY;
    ctx.fillStyle = '#5a2a1a';
    ctx.fillRect(x, y, CLOSE_SIZE, CLOSE_SIZE);
    ctx.strokeStyle = '#e8d8a8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + CLOSE_SIZE - 4, y + CLOSE_SIZE - 4);
    ctx.moveTo(x + CLOSE_SIZE - 4, y + 4);
    ctx.lineTo(x + 4, y + CLOSE_SIZE - 4);
    ctx.stroke();
  }
}

export default DialogBox;
