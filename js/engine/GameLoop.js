/**
 * GameLoop.js — 固定步长游戏主循环
 *
 * 设计要点：
 * - 逻辑更新使用固定步长（默认 30 次/秒，dt = 1000/30 ms），保证物理/AI 行为稳定。
 * - 渲染跟随 requestAnimationFrame，并传入插值系数 interpolation ∈ [0,1)，
 *   用于在两次逻辑更新之间平滑绘制（避免帧率抖动造成的卡顿感）。
 * - 使用 performance.now() 做时间累积；切换标签页后 dt 过大时自动丢弃累积，
 *   避免"螺旋死亡"（一次卡顿后疯狂补帧）。
 */

export class GameLoop {
  /**
   * @param {(dt:number)=>void} updateCallback 逻辑更新回调，dt 单位为秒
   * @param {(interpolation:number)=>void} renderCallback 渲染回调，interpolation ∈ [0,1)
   * @param {number} [targetUPS=30] 每秒逻辑更新次数
   */
  constructor(updateCallback, renderCallback, targetUPS = 30) {
    this.updateCallback = updateCallback;
    this.renderCallback = renderCallback;

    /** 每秒逻辑更新次数 */
    this.targetUPS = targetUPS;
    /** 单步逻辑时间（毫秒） */
    this.stepMs = 1000 / targetUPS;
    /** 单步逻辑时间（秒），传给 update 回调 */
    this.stepSec = 1 / targetUPS;

    /** 是否正在运行 */
    this._running = false;
    /** requestAnimationFrame 句柄 */
    this._rafId = 0;
    /** 上一帧时间戳（毫秒） */
    this._lastTime = 0;
    /** 时间累积器（毫秒） */
    this._accumulator = 0;

    // ===== 帧率统计 =====
    /** 当前 FPS（每秒刷新一次） */
    this._fps = 0;
    this._frameCount = 0;
    this._fpsTime = 0;

    // 绑定 this，避免 addEventListener / raf 丢失上下文
    this._tick = this._tick.bind(this);
  }

  /** 启动主循环 */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._accumulator = 0;
    this._frameCount = 0;
    this._fpsTime = this._lastTime;
    this._rafId = requestAnimationFrame(this._tick);
  }

  /** 停止主循环 */
  stop() {
    this._running = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  /** 获取当前 FPS */
  getFPS() {
    return this._fps;
  }

  /** 主循环单帧 */
  _tick(now) {
    if (!this._running) return;

    let frameTime = now - this._lastTime;
    this._lastTime = now;

    // 限制单帧时间上限：标签页切回时 dt 可能巨大，直接丢弃避免补帧风暴
    const MAX_FRAME_MS = 250;
    if (frameTime > MAX_FRAME_MS) {
      frameTime = MAX_FRAME_MS;
    }

    this._accumulator += frameTime;

    // 固定步长消费累积时间，最多消费若干步以防极端情况下死循环
    let steps = 0;
    const MAX_STEPS = 5;
    while (this._accumulator >= this.stepMs && steps < MAX_STEPS) {
      this.updateCallback(this.stepSec);
      this._accumulator -= this.stepMs;
      steps++;
    }
    // 若仍有大量未消费时间（>5 步），直接丢弃，保持实时性
    if (this._accumulator > this.stepMs * MAX_STEPS) {
      this._accumulator = 0;
    }

    // 插值系数：当前累积量占一个步长的比例
    const interpolation = this._accumulator / this.stepMs;
    this.renderCallback(interpolation);

    // FPS 统计：每秒结算一次
    this._frameCount++;
    if (now - this._fpsTime >= 1000) {
      this._fps = this._frameCount;
      this._frameCount = 0;
      this._fpsTime = now;
    }

    this._rafId = requestAnimationFrame(this._tick);
  }
}

export default GameLoop;
