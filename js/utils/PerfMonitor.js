/**
 * PerfMonitor.js — 轻量性能监控工具（调试模式启用）
 *
 * 职责：
 * - 记录每帧 update / render 耗时（指数移动平均，平滑显示）
 * - 统计实体数量（由调用方 setEntityCount 写入）
 * - 统计绘制调用数（drawImage 调用，通过 instrumentContext 包装 ctx 计数；
 *   也可由调用方 addDrawCall 手动累加）
 * - 计算 FPS（每秒结算一次）
 * - getReport() 返回统一快照，供 HUD / 控制台输出
 *
 * 用法（main.js 调试模式）：
 *   import { PerfMonitor } from './utils/PerfMonitor.js';
 *   const perf = new PerfMonitor();
 *   perf.instrumentContext(ctx);           // 一次性包装，开始计数 drawImage
 *   // 每帧：
 *   perf.beginUpdate(); ... ; perf.endUpdate();
 *   perf.resetDrawCalls();
 *   perf.beginRender(); ... ; perf.endRender();
 *   perf.setEntityCount(scene.monsters.length + ...);
 *   const r = perf.getReport();
 *
 * 设计原则：低开销、可选启用；非调试模式下不构造 / 不调用即零成本。
 */

export class PerfMonitor {
  constructor() {
    // ===== 计时（高精度时间戳，毫秒）=====
    this._updateStart = 0;
    this._renderStart = 0;

    // 指数移动平均（EMA）后的耗时，避免单帧抖动
    this._updateTimeMs = 0;
    this._renderTimeMs = 0;
    /** EMA 平滑系数，越小越平滑 */
    this._emaAlpha = 0.1;

    // ===== 实体数量 =====
    this._entityCount = 0;

    // ===== 绘制调用数 =====
    this._drawCalls = 0;

    // ===== FPS（每秒结算一次）=====
    this._fps = 0;
    this._frameCount = 0;
    this._fpsTime = 0;

    // 是否已包装 ctx（防止重复包装导致双重计数）
    this._ctxInstrumented = false;
  }

  // ===== update 计时 =====

  /** 在每帧逻辑更新开始处调用 */
  beginUpdate() {
    this._updateStart = performance.now();
  }

  /** 在每帧逻辑更新结束处调用 */
  endUpdate() {
    if (!this._updateStart) return;
    const dt = performance.now() - this._updateStart;
    this._updateTimeMs = this._ema(this._updateTimeMs, dt);
    this._updateStart = 0;
  }

  // ===== render 计时 =====

  /** 在每帧渲染开始处调用 */
  beginRender() {
    this._renderStart = performance.now();
  }

  /** 在每帧渲染结束处调用；同时结算 FPS */
  endRender() {
    const now = performance.now();
    if (this._renderStart) {
      const dt = now - this._renderStart;
      this._renderTimeMs = this._ema(this._renderTimeMs, dt);
      this._renderStart = 0;
    }
    // FPS 结算：每秒统计一次帧数
    this._frameCount++;
    if (this._fpsTime === 0) {
      this._fpsTime = now;
    } else if (now - this._fpsTime >= 1000) {
      this._fps = this._frameCount;
      this._frameCount = 0;
      this._fpsTime = now;
    }
  }

  // ===== 实体数量 =====

  /**
   * 设置当前实体总数（由调用方统计后写入）
   * @param {number} n
   */
  setEntityCount(n) {
    this._entityCount = n | 0;
  }

  // ===== 绘制调用数 =====

  /**
   * 累加绘制调用数（手动计数）
   * @param {number} [n=1]
   */
  addDrawCall(n = 1) {
    this._drawCalls += n;
  }

  /** 直接设置绘制调用数 */
  setDrawCalls(n) {
    this._drawCalls = n | 0;
  }

  /** 每帧渲染开始前重置绘制调用计数 */
  resetDrawCalls() {
    this._drawCalls = 0;
  }

  /**
   * 包装 CanvasRenderingContext2D，自动统计 drawImage 调用数
   * 仅包装 drawImage（精灵绘制主路径）；其它 ctx 方法零开销
   * 多次调用安全（已包装则跳过）
   * @param {CanvasRenderingContext2D} ctx
   * @returns {CanvasRenderingContext2D} 原 ctx（已就地包装）
   */
  instrumentContext(ctx) {
    if (!ctx || this._ctxInstrumented) return ctx;
    const self = this;
    const origDrawImage = ctx.drawImage.bind(ctx);
    ctx.drawImage = function (...args) {
      self._drawCalls++;
      return origDrawImage(...args);
    };
    this._ctxInstrumented = true;
    return ctx;
  }

  // ===== 报告 =====

  /**
   * 获取性能快照
   * @returns {{fps:number, updateTimeMs:number, renderTimeMs:number, entityCount:number, drawCalls:number}}
   */
  getReport() {
    return {
      fps: this._fps,
      updateTimeMs: this._updateTimeMs,
      renderTimeMs: this._renderTimeMs,
      entityCount: this._entityCount,
      drawCalls: this._drawCalls,
    };
  }

  // ===== 内部辅助 =====

  /**
   * 指数移动平均
   * @param {number} prev 上一次平均值
   * @param {number} sample 本次采样
   * @returns {number}
   */
  _ema(prev, sample) {
    if (!prev) return sample;
    return prev * (1 - this._emaAlpha) + sample * this._emaAlpha;
  }

  /** 重置全部统计（切换场景 / 重新启用时调用） */
  reset() {
    this._updateTimeMs = 0;
    this._renderTimeMs = 0;
    this._entityCount = 0;
    this._drawCalls = 0;
    this._fps = 0;
    this._frameCount = 0;
    this._fpsTime = 0;
    this._updateStart = 0;
    this._renderStart = 0;
  }
}

export default PerfMonitor;
