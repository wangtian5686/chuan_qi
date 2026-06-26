/**
 * IsometricMap.js — 2.5D 等距瓦片地图渲染引擎
 *
 * 核心约定：
 * - 瓦片尺寸：宽 64 像素，高 32 像素（标准 2:1 等距）
 * - 世界坐标系：原点在瓦片 (0,0) 中心，单位为像素
 * - 坐标转换公式（无相机偏移时）：
 *     屏幕坐标 sx = (tx - ty) * (tileW / 2)
 *     屏幕坐标 sy = (tx + ty) * (tileH / 2)
 *     反之：tx = (sx / (tileW/2) + sy / (tileH/2)) / 2
 *           ty = (sy / (tileH/2) - sx / (tileW/2)) / 2
 * - 相机偏移由 Camera.worldToScreen 统一处理，本类仅产出"世界坐标"
 * - Y 排序：等距视角下，越靠右下（tx+ty 越大）的瓦片绘制越晚，以正确遮挡
 */

import { TILE_COLORS } from '../data/tiles.js';

export class IsometricMap {
  /**
   * @param {object} mapData 地图数据对象（见 data/maps/*.js）
   */
  constructor(mapData) {
    this.mapData = mapData;
    this.id = mapData.id;
    this.name = mapData.name;
    this.width = mapData.width;   // 列数
    this.height = mapData.height; // 行数

    this.groundLayer = mapData.groundLayer || [];
    this.objectLayer = mapData.objectLayer || [];
    this.walkable = mapData.walkable || [];
    this.safeZone = mapData.safeZone || [];
    this.spawns = mapData.spawns || [];
    this.npcs = mapData.npcs || [];
    this.teleports = mapData.teleports || [];
    this.playerStart = mapData.playerStart || { x: 0, y: 0 };

    // 瓦片像素尺寸
    this.tileW = 64;
    this.tileH = 32;

    // 预计算地图世界包围盒（用于相机 clamp / 边界判定）
    // 取地图四个角瓦片中心的世界坐标极值
    this._computeBounds();
  }

  /** 计算地图在世界坐标系下的包围盒 */
  _computeBounds() {
    const c0 = this.tileToWorld(0, 0);
    const c1 = this.tileToWorld(this.width - 1, 0);
    const c2 = this.tileToWorld(0, this.height - 1);
    const c3 = this.tileToWorld(this.width - 1, this.height - 1);
    this.worldBounds = {
      minX: Math.min(c0.wx, c1.wx, c2.wx, c3.wx) - this.tileW / 2,
      maxX: Math.max(c0.wx, c1.wx, c2.wx, c3.wx) + this.tileW / 2,
      minY: Math.min(c0.wy, c1.wy, c2.wy, c3.wy) - this.tileH / 2,
      maxY: Math.max(c0.wy, c1.wy, c2.wy, c3.wy) + this.tileH / 2,
    };
  }

  // ===== 坐标转换 =====

  /**
   * 世界像素坐标 -> 瓦片坐标
   * @param {number} wx 世界 X（像素）
   * @param {number} wy 世界 Y（像素）
   * @returns {{tx:number, ty:number}} 瓦片列/行（可能为浮点，调用方可按需取整）
   */
  worldToTile(wx, wy) {
    const halfW = this.tileW / 2;
    const halfH = this.tileH / 2;
    const tx = (wx / halfW + wy / halfH) / 2;
    const ty = (wy / halfH - wx / halfW) / 2;
    return { tx, ty };
  }

  /**
   * 瓦片坐标 -> 世界像素坐标（瓦片中心）
   * @param {number} tx 列
   * @param {number} ty 行
   * @returns {{wx:number, wy:number}}
   */
  tileToWorld(tx, ty) {
    return {
      wx: (tx - ty) * (this.tileW / 2),
      wy: (tx + ty) * (this.tileH / 2),
    };
  }

  // ===== 通行性 =====

  /** 越界检查：瓦片坐标是否在地图范围内 */
  inBounds(tx, ty) {
    return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
  }

  /**
   * 该瓦片是否可行走（含越界检查）
   * 综合考虑：地图边界、walkable 标记
   * @param {number} tx 列
   * @param {number} ty 行
   * @returns {boolean}
   */
  isWalkable(tx, ty) {
    if (!this.inBounds(tx, ty)) return false;
    if (!this.walkable.length) return true;
    const row = this.walkable[ty];
    if (!row) return false;
    return !!row[tx];
  }

  // ===== 安全区（射线法点在多边形内判定）=====

  /**
   * 瓦片是否在安全区内
   * @param {number} tx
   * @param {number} ty
   * @returns {boolean}
   */
  isInSafeZone(tx, ty) {
    if (!this.safeZone || this.safeZone.length < 3) return false;
    return IsometricMap.pointInPolygon(tx + 0.5, ty + 0.5, this.safeZone);
  }

  /**
   * 射线法判断点是否在多边形内
   * @param {number} px 点 X
   * @param {number} py 点 Y
   * @param {number[][]} poly 多边形顶点 [[x,y],...]
   * @returns {boolean}
   */
  static pointInPolygon(px, py, poly) {
    let inside = false;
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = poly[i][0], yi = poly[i][1];
      const xj = poly[j][0], yj = poly[j][1];
      // 判断射线与边的交点：使用经典的奇偶规则
      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // ===== 视口剔除 =====

  /**
   * 计算当前相机视口内可见的瓦片范围
   * 思路：取视口四角的世界坐标，反推瓦片坐标，得到外接矩形并适度外扩，
   *      覆盖因等距菱形造成的边角瓦片。
   * @param {import('./Camera.js').Camera} camera
   * @returns {{minTx:number, maxTx:number, minTy:number, maxTy:number}}
   */
  getVisibleTileRange(camera) {
    const vw = camera.viewportW;
    const vh = camera.viewportH;
    // 视口四角世界坐标
    const corners = [
      camera.screenToWorld(0, 0),
      camera.screenToWorld(vw, 0),
      camera.screenToWorld(0, vh),
      camera.screenToWorld(vw, vh),
    ];
    let minTx = Infinity, maxTx = -Infinity, minTy = Infinity, maxTy = -Infinity;
    for (const c of corners) {
      const t = this.worldToTile(c.x, c.y);
      if (t.tx < minTx) minTx = t.tx;
      if (t.tx > maxTx) maxTx = t.tx;
      if (t.ty < minTy) minTy = t.ty;
      if (t.ty > maxTy) maxTy = t.ty;
    }
    // 外扩 1~2 格应对菱形边角与物体高度溢出
    const pad = 2;
    minTx = Math.max(0, Math.floor(minTx) - pad);
    minTy = Math.max(0, Math.floor(minTy) - pad);
    maxTx = Math.min(this.width - 1, Math.ceil(maxTx) + pad);
    maxTy = Math.min(this.height - 1, Math.ceil(maxTy) + pad);
    return { minTx, maxTx, minTy, maxTy };
  }

  // ===== 渲染 =====

  /**
   * 渲染地图：地面层先行（按行扫描），物体层与实体由 Scene 统一 Y 排序。
   * 本方法只负责：
   *   1. 绘制视口内地面瓦片
   *   2. 收集物体层 sprite 并交由 Scene 走 Y 排序（通过返回值）
   * 注意：为保持职责清晰，render 仅绘制地面层；物体层绘制通过
   *       collectObjectSprites() 暴露给 Scene 统一排序。
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./Camera.js').Camera} camera
   * @param {import('./AssetLoader.js').AssetLoader} assetLoader
   * @returns {Array} 物体层 sprite 列表，供 Scene Y 排序使用
   */
  render(ctx, camera, assetLoader) {
    // 1. 绘制地面层
    this._renderGroundLayer(ctx, camera, assetLoader);
    // 2. 收集物体层 sprite（不在此绘制，交由 Scene 与实体统一 Y 排序）
    return this.collectObjectSprites(ctx, camera, assetLoader);
  }

  /** 绘制视口内地面瓦片（按 ty 行扫描，tx 列顺序绘制） */
  _renderGroundLayer(ctx, camera, assetLoader) {
    const { minTx, maxTx, minTy, maxTy } = this.getVisibleTileRange(camera);
    for (let ty = minTy; ty <= maxTy; ty++) {
      const row = this.groundLayer[ty];
      if (!row) continue;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tileId = row[tx];
        if (!tileId) continue;
        this._drawGroundTile(ctx, camera, assetLoader, tx, ty, tileId);
      }
    }
  }

  /**
   * 绘制单个地面瓦片（菱形）
   * 优先使用 assetLoader.getImage(`tile_${id}`)；若无则用 TILE_COLORS 占位色块
   */
  _drawGroundTile(ctx, camera, assetLoader, tx, ty, tileId) {
    const { wx, wy } = this.tileToWorld(tx, ty);
    const s = camera.worldToScreen(wx, wy);
    const hw = this.tileW / 2;
    const hh = this.tileH / 2;
    const cx = s.x;
    const cy = s.y;

    const img = assetLoader && assetLoader.getImage(`tile_${tileId}`);
    if (img) {
      // 图片以瓦片中心为锚点绘制
      ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(cy - img.height / 2));
    } else {
      // 占位：菱形纯色填充
      const color = TILE_COLORS[tileId] || '#444';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx, cy - hh);
      ctx.lineTo(cx + hw, cy);
      ctx.lineTo(cx, cy + hh);
      ctx.lineTo(cx - hw, cy);
      ctx.closePath();
      ctx.fill();
      // 描边以增强网格感
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  /**
   * 收集视口内物体层 sprite（不绘制），供 Scene 与实体统一 Y 排序
   * 每个 sprite：{ sortY, draw(ctx) }
   * sortY 用世界 Y（= (tx+ty)*(tileH/2)）排序；等距下越大越靠前绘制
   *
   * @returns {Array<{sortY:number, draw:Function}>}
   */
  collectObjectSprites(ctx, camera, assetLoader) {
    const sprites = [];
    const { minTx, maxTx, minTy, maxTy } = this.getVisibleTileRange(camera);
    for (let ty = minTy; ty <= maxTy; ty++) {
      const row = this.objectLayer[ty];
      if (!row) continue;
      for (let tx = minTx; tx <= maxTx; tx++) {
        const tileId = row[tx];
        if (!tileId) continue;
        // PORTAL / NPC_BASE 是地面装饰，直接在地面层之上绘制，不参与 Y 排序遮挡
        if (tileId === 200 /* PORTAL */ || tileId === 201 /* NPC_BASE */) {
          sprites.push(this._makeGroundDecoSprite(camera, assetLoader, tx, ty, tileId));
          continue;
        }
        sprites.push(this._makeObjectSprite(camera, assetLoader, tx, ty, tileId));
      }
    }
    return sprites;
  }

  /** 构造一个地面装饰 sprite（PORTAL/NPC_BASE），sortY 设为瓦片中心 Y */
  _makeGroundDecoSprite(camera, assetLoader, tx, ty, tileId) {
    const { wx, wy } = this.tileToWorld(tx, ty);
    const sortY = wy;
    const self = this;
    return {
      sortY,
      draw(ctx) {
        self._drawObjectTile(ctx, camera, assetLoader, tx, ty, tileId, /*height*/ 0);
      },
    };
  }

  /** 构造一个物体层 sprite（TREE/ROCK/WALL 等），sortY 为瓦片中心 Y */
  _makeObjectSprite(camera, assetLoader, tx, ty, tileId) {
    const { wx, wy } = this.tileToWorld(tx, ty);
    const sortY = wy;
    const self = this;
    // 根据物体类型估算视觉高度（用于占位绘制时向上偏移）
    const height = self._getObjectHeight(tileId);
    return {
      sortY,
      draw(ctx) {
        self._drawObjectTile(ctx, camera, assetLoader, tx, ty, tileId, height);
      },
    };
  }

  /** 根据物体瓦片 ID 估算占位绘制高度（像素），真实资源接入后由图片尺寸决定 */
  _getObjectHeight(tileId) {
    switch (tileId) {
      case 101 /* TREE */: return 64;
      case 102 /* ROCK */: return 32;
      case 103: case 104: case 105 /* WALL */: return 48;
      case 110 /* BUILDING */: return 96;
      case 111 /* FENCE */: return 24;
      case 112 /* BUSH */: return 20;
      case 113 /* TORCH */: return 40;
      default: return 32;
    }
  }

  /**
   * 绘制单个物体层瓦片
   * 优先用 `tile_${id}` 图片；否则用占位色块（向上延伸 height 像素的矩形）
   * @param {number} height 占位绘制时向上延伸的高度
   */
  _drawObjectTile(ctx, camera, assetLoader, tx, ty, tileId, height) {
    const { wx, wy } = this.tileToWorld(tx, ty);
    const s = camera.worldToScreen(wx, wy);
    const cx = s.x;
    const cy = s.y;

    const img = assetLoader && assetLoader.getImage(`tile_${tileId}`);
    if (img) {
      // 图片以底部中心为锚点（脚踩瓦片中心）
      ctx.drawImage(
        img,
        Math.round(cx - img.width / 2),
        Math.round(cy - img.height)
      );
      return;
    }

    // 占位绘制
    const hw = this.tileW / 2;
    const color = TILE_COLORS[tileId] || 'rgba(80,80,80,0.8)';

    if (tileId === 200 /* PORTAL */) {
      // 传送光圈：在瓦片中心绘制椭圆光圈
      ctx.save();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, hw, this.tileH / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(220,200,255,0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (tileId === 201 /* NPC_BASE */) {
      // NPC 底座：扁椭圆
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(cx, cy, hw * 0.8, this.tileH / 2 * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // 一般物体：以瓦片底边中点为锚，向上画一个矩形+底座菱形
    const baseY = cy + this.tileH / 2; // 瓦片底边
    const topY = baseY - height;
    ctx.save();
    // 底座菱形（轻微阴影感）
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(cx, cy - this.tileH / 2);
    ctx.lineTo(cx + hw, cy);
    ctx.lineTo(cx, cy + this.tileH / 2);
    ctx.lineTo(cx - hw, cy);
    ctx.closePath();
    ctx.fill();
    // 主体矩形（半透明色）
    ctx.fillStyle = color;
    ctx.fillRect(cx - hw * 0.6, topY, hw * 1.2, height);
    // 描边
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - hw * 0.6, topY, hw * 1.2, height);
    ctx.restore();
  }

  /**
   * 供其他模块绘制精灵时调用：根据瓦片坐标返回 sprite 描述，确保 Y 排序正确。
   * 实际上由调用方收集 sprite 列表后统一排序绘制（见 Scene）。
   *
   * @param {import('./Camera.js').Camera} camera
   * @param {HTMLImageElement|HTMLCanvasElement} sprite 精灵图
   * @param {number} tx 瓦片列
   * @param {number} ty 瓦片行
   * @param {number} height 精灵视觉高度（占位用，真实图片以图片尺寸为准）
   * @returns {{sortY:number, draw:function}}
   */
  renderObject(ctx, camera, sprite, tx, ty, height) {
    const { wx, wy } = this.tileToWorld(tx, ty);
    const sortY = wy;
    return {
      sortY,
      draw(ctx2) {
        if (!sprite) return;
        const s = camera.worldToScreen(wx, wy);
        ctx2.drawImage(
          sprite,
          Math.round(s.x - sprite.width / 2),
          Math.round(s.y - sprite.height)
        );
      },
    };
  }
}

export default IsometricMap;
