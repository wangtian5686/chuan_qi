/**
 * LoadingScreen.js — 加载界面（Canvas 绘制）
 *
 * 职责：
 * - 在资源加载阶段显示全屏黑色背景与居中进度条
 * - 由 Game 在预加载阶段调用 setProgress 更新进度，每帧 render 绘制
 * - 进度条宽度固定 300px、高度 20px，下方显示文字（默认带百分比）
 *
 * 坐标约定：使用 canvas 的 CSS 像素尺寸（与 setTransform(dpr) 后的绘图坐标系一致）。
 */

export class LoadingScreen {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;

    /** 进度 0~1 */
    this.progress = 0;
    /** 进度条下方提示文字（不含百分比，render 时自动追加） */
    this.text = '';

    /** 进度条尺寸（像素） */
    this.barW = 300;
    this.barH = 20;
  }

  /**
   * 设置进度与提示文字
   * @param {number} progress 0~1，超出范围自动钳制
   * @param {string} [text] 提示文字，省略则保留原文字
   */
  setProgress(progress, text) {
    let p = Number(progress);
    if (isNaN(p)) p = 0;
    if (p < 0) p = 0;
    if (p > 1) p = 1;
    this.progress = p;
    if (text !== undefined) this.text = String(text);
  }

  /** 取画布 CSS 像素尺寸（与绘图坐标系一致） */
  _cssSize() {
    const w = this.canvas.clientWidth || this.canvas.width || window.innerWidth;
    const h = this.canvas.clientHeight || this.canvas.height || window.innerHeight;
    return { w, h };
  }

  /**
   * 绘制加载界面
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    const { w, h } = this._cssSize();

    // 全屏黑色背景
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // 进度条居中
    const bx = Math.floor((w - this.barW) / 2);
    const by = Math.floor((h - this.barH) / 2);

    // 背景框
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(bx, by, this.barW, this.barH);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6a5a2a';
    ctx.strokeRect(bx + 0.5, by + 0.5, this.barW - 1, this.barH - 1);

    // 已填充部分
    const fillW = Math.max(0, Math.floor(this.barW * this.progress));
    if (fillW > 0) {
      ctx.fillStyle = '#c8902a';
      ctx.fillRect(bx + 2, by + 2, fillW - 4, this.barH - 4);
    }

    // 百分比文字（进度条内居中）
    const percent = Math.floor(this.progress * 100);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${percent}%`, bx + this.barW / 2, by + this.barH / 2);

    // 进度条下方提示文字
    const label = this.text || '正在加载资源...';
    ctx.fillStyle = '#e8d8a0';
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${label}  ${percent}%`, w / 2, by + this.barH + 14);
  }
}

export default LoadingScreen;
