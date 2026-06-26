/**
 * Teleport.js — 传送点视觉 / 触发器
 *
 * 职责：
 * - 持有单个传送点的瓦片坐标、目标地图与目标坐标、显示标签
 * - 维护光环动画相位 phase（由外部 update 驱动）
 * - 输出渲染信息供 Scene / 渲染层绘制传送光圈
 * - contains(tx, ty)：判断玩家所在瓦片是否命中本传送点
 *
 * 说明：
 * - 本类仅承载传送点的“数据 + 视觉描述”，不直接执行切图；
 *   实际切图由 MapManager.checkTeleport 检测命中后调用 loadMap 完成。
 * - wx / wy 按等距瓦片公式计算（瓦片宽 64 高 32，与 IsometricMap 一致），
 *   避免对地图实例的硬依赖。
 */

/** 等距瓦片像素尺寸（与 IsometricMap 一致） */
const TILE_W = 64;
const TILE_H = 32;

/**
 * 瓦片坐标 -> 世界像素坐标（瓦片中心）
 * 与 IsometricMap.tileToWorld 公式一致。
 * @param {number} tx 列
 * @param {number} ty 行
 * @returns {{wx:number, wy:number}}
 */
function tileToWorld(tx, ty) {
  return {
    wx: (tx - ty) * (TILE_W / 2),
    wy: (tx + ty) * (TILE_H / 2),
  };
}

export class Teleport {
  /**
   * @param {object} config 传送点配置
   * @param {number} config.x 瓦片列
   * @param {number} config.y 瓦片行
   * @param {string} config.targetMap 目标地图 id
   * @param {number} config.targetX 目标瓦片 X
   * @param {number} config.targetY 目标瓦片 Y
   * @param {string} [config.label] 传送点显示标签
   */
  constructor(config) {
    const c = config || {};
    this.tx = c.x;
    this.ty = c.y;
    const w = tileToWorld(this.tx, this.ty);
    this.wx = w.wx;
    this.wy = w.wy;
    this.targetMap = c.targetMap;
    this.targetX = c.targetX;
    this.targetY = c.targetY;
    this.label = c.label || '';
    /** 光环颜色（中紫色，经典传送门配色） */
    this.color = '#9370DB';
    /** 光环动画相位（秒），由 update 累加 */
    this.phase = 0;
  }

  /**
   * 每帧更新动画相位
   * @param {number} dt 帧间隔（秒）
   */
  update(dt) {
    this.phase += dt;
  }

  /**
   * 返回渲染信息，供渲染层绘制传送光圈
   * @returns {{worldX:number, worldY:number, type:string, phase:number, color:string, label:string}}
   */
  getRenderInfo() {
    return {
      worldX: this.wx,
      worldY: this.wy,
      type: 'portal',
      phase: this.phase,
      color: this.color,
      label: this.label,
    };
  }

  /**
   * 玩家所在瓦片是否命中本传送点
   * @param {number} tx 玩家瓦片列
   * @param {number} ty 玩家瓦片行
   * @returns {boolean}
   */
  contains(tx, ty) {
    return tx === this.tx && ty === this.ty;
  }
}

export default Teleport;
