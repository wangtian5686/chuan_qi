/**
 * Camera.js — 2D 相机
 *
 * 职责：
 * - 维护世界坐标中心 (x,y) 与视口尺寸 (viewportW,viewportH)
 * - follow(target, lerp) 平滑跟随目标（带可调插值系数）
 * - worldToScreen / screenToWorld 坐标互转
 * - clamp 限制相机中心不出地图边界（地图以左上角原点、宽高描述）
 *
 * 约定：相机中心对准视口中心。worldToScreen 返回的屏幕坐标以 canvas 左上角为原点。
 */

export class Camera {
  /**
   * @param {number} viewportW 视口宽（通常等于 canvas.width）
   * @param {number} viewportH 视口高（通常等于 canvas.height）
   */
  constructor(viewportW, viewportH) {
    /** 相机中心所在世界坐标 */
    this.x = 0;
    this.y = 0;
    this.viewportW = viewportW;
    this.viewportH = viewportH;

    /** 边界限制（世界坐标），null 表示不限制 */
    this._bounds = null; // {minX, minY, maxX, maxY}
  }

  /** 设置视口尺寸（窗口 resize 时调用） */
  setViewport(w, h) {
    this.viewportW = w;
    this.viewportH = h;
  }

  /** 直接设置相机中心（立即生效，不做平滑） */
  setCenter(x, y) {
    this.x = x;
    this.y = y;
    this._applyBounds();
  }

  /**
   * 平滑跟随目标
   * @param {{x:number, y:number}} target 目标对象（需有 x,y 世界坐标）
   * @param {number} [lerp=0.1] 插值系数，越大跟随越快，1 为瞬间贴合
   */
  follow(target, lerp = 0.1) {
    if (!target) return;
    this.x += (target.x - this.x) * lerp;
    this.y += (target.y - this.y) * lerp;
    this._applyBounds();
  }

  /**
   * 设置地图边界（世界坐标，左上角为原点）
   * @param {number} minX
   * @param {number} minY
   * @param {number} maxX 地图右边界（宽度）
   * @param {number} maxY 地图下边界（高度）
   */
  clamp(minX, minY, maxX, maxY) {
    this._bounds = { minX, minY, maxX, maxY };
    this._applyBounds();
  }

  /** 清除边界限制 */
  clearClamp() {
    this._bounds = null;
  }

  /** 应用边界限制到当前中心 */
  _applyBounds() {
    if (!this._bounds) return;
    const b = this._bounds;
    // 相机可显示范围半宽/半高
    const halfW = this.viewportW / 2;
    const halfH = this.viewportH / 2;

    // 当地图小于视口时，将地图居中显示而非反向越界
    if (b.maxX - b.minX <= this.viewportW) {
      this.x = (b.minX + b.maxX) / 2;
    } else {
      this.x = Math.max(b.minX + halfW, Math.min(b.maxX - halfW, this.x));
    }
    if (b.maxY - b.minY <= this.viewportH) {
      this.y = (b.minY + b.maxY) / 2;
    } else {
      this.y = Math.max(b.minY + halfH, Math.min(b.maxY - halfH, this.y));
    }
  }

  /**
   * 世界坐标 -> 屏幕坐标
   * @param {number} wx
   * @param {number} wy
   * @returns {{x:number, y:number}}
   */
  worldToScreen(wx, wy) {
    return {
      x: wx - this.x + this.viewportW / 2,
      y: wy - this.y + this.viewportH / 2,
    };
  }

  /**
   * 屏幕坐标 -> 世界坐标
   * @param {number} sx
   * @param {number} sy
   * @returns {{x:number, y:number}}
   */
  screenToWorld(sx, sy) {
    return {
      x: sx + this.x - this.viewportW / 2,
      y: sy + this.y - this.viewportH / 2,
    };
  }
}

export default Camera;
