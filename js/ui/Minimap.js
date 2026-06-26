/**
 * Minimap.js — 小地图
 *
 * 职责：
 * - 右上角 120×120 半透明矩形，缩放绘制整张地图瓦片轮廓
 * - 安全区（map.safeZone 多边形）用绿色描边 + 淡绿填充
 * - 玩家白点 / 怪物红点 / NPC 绿点 / 传送点紫点
 * - 当前相机视口用白色矩形框（取视口四角瓦片外接矩形）
 *
 * 约定：
 * - map 为 IsometricMap 实例（含 width/height/safeZone/npcs/teleports/worldToTile）
 * - monsters 为外部（Hud/UiManager）注入的怪物数组，每项含 tx/ty 或 worldX/worldY
 * - 坐标为 canvas 内 CSS 像素
 */

export class Minimap {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    /** 小地图边长（像素） */
    this.size = 120;
    /** 左上角坐标（render 时按画布尺寸重算） */
    this.x = 0;
    this.y = 0;
    /** 地图→小地图缩放系数（render 时按 map 尺寸重算） */
    this.scale = 1;
    /** 是否可见 */
    this.visible = true;
    /** 怪物列表（由 Hud/UiManager 注入，每项含 tx/ty 或 worldX/worldY） */
    this.monsters = [];
  }

  /**
   * @param {number} dt 帧间隔（秒）
   * @param {object} player Player 实例
   */
  update(dt, player) {
    // 当前无逐帧状态更新；保留接口
  }

  /** 取画布 CSS 像素尺寸 */
  _cssSize() {
    const w = this.canvas
      ? (this.canvas.clientWidth || this.canvas.width)
      : 800;
    const h = this.canvas
      ? (this.canvas.clientHeight || this.canvas.height)
      : 600;
    return { w, h };
  }

  /**
   * 渲染小地图
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} player Player 实例（含 tx/ty）
   * @param {object} camera Camera 实例
   * @param {object} map IsometricMap 实例
   */
  render(ctx, player, camera, map) {
    if (!this.visible) return;
    const { w: vw } = this._cssSize();
    // 右上角，留出顶部 MP 球空间
    this.x = vw - this.size - 8;
    this.y = 100;
    const size = this.size;

    const mapW = (map && map.width) || 1;
    const mapH = (map && map.height) || 1;
    this.scale = size / Math.max(mapW, mapH);

    ctx.save();

    // 背景
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(this.x, this.y, size, size);
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x + 0.5, this.y + 0.5, size - 1, size - 1);

    // 地图范围底色（缩放 map.width × map.height 到 120×120）
    const drawW = mapW * this.scale;
    const drawH = mapH * this.scale;
    ctx.fillStyle = 'rgba(80, 90, 70, 0.5)';
    ctx.fillRect(this.x, this.y, drawW, drawH);

    // 安全区多边形（绿色高亮）
    if (map && map.safeZone && map.safeZone.length >= 3) {
      ctx.beginPath();
      for (let i = 0; i < map.safeZone.length; i++) {
        const px = this.x + map.safeZone[i][0] * this.scale;
        const py = this.y + map.safeZone[i][1] * this.scale;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(80, 220, 120, 0.14)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(80, 220, 120, 0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // 传送点（紫点）
    if (map && map.teleports) {
      ctx.fillStyle = '#c060ff';
      for (const t of map.teleports) {
        const px = this.x + (t.x + 0.5) * this.scale;
        const py = this.y + (t.y + 0.5) * this.scale;
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
    }

    // NPC（绿点）
    if (map && map.npcs) {
      ctx.fillStyle = '#40d060';
      for (const n of map.npcs) {
        const px = this.x + (n.x + 0.5) * this.scale;
        const py = this.y + (n.y + 0.5) * this.scale;
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
    }

    // 怪物（红点）
    if (this.monsters && this.monsters.length) {
      ctx.fillStyle = '#ff4040';
      for (const m of this.monsters) {
        if (!m) continue;
        // 优先用瓦片坐标；仅有世界坐标时按等距公式反推
        let cx, cy;
        if (m.tx != null && m.ty != null) {
          cx = m.tx;
          cy = m.ty;
        } else if (m.worldX != null && m.worldY != null) {
          // worldX = (tx-ty)*32, worldY = (tx+ty)*16
          cx = (m.worldX / 32 + m.worldY / 16) / 2;
          cy = (m.worldY / 16 - m.worldX / 32) / 2;
        } else {
          continue;
        }
        const px = this.x + (cx + 0.5) * this.scale;
        const py = this.y + (cy + 0.5) * this.scale;
        ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
      }
    }

    // 相机视口（白色矩形框）：取视口四角瓦片外接矩形
    if (camera && map && typeof map.worldToTile === 'function') {
      const corners = [
        camera.screenToWorld(0, 0),
        camera.screenToWorld(camera.viewportW, 0),
        camera.screenToWorld(0, camera.viewportH),
        camera.screenToWorld(camera.viewportW, camera.viewportH),
      ];
      let minTx = Infinity, maxTx = -Infinity, minTy = Infinity, maxTy = -Infinity;
      for (const c of corners) {
        const t = map.worldToTile(c.x, c.y);
        if (t.tx < minTx) minTx = t.tx;
        if (t.tx > maxTx) maxTx = t.tx;
        if (t.ty < minTy) minTy = t.ty;
        if (t.ty > maxTy) maxTy = t.ty;
      }
      const rx = this.x + minTx * this.scale;
      const ry = this.y + minTy * this.scale;
      const rw = (maxTx - minTx) * this.scale;
      const rh = (maxTy - minTy) * this.scale;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.strokeRect(rx, ry, rw, rh);
    }

    // 玩家（白点）
    if (player && player.tx != null) {
      const px = this.x + (player.tx + 0.5) * this.scale;
      const py = this.y + (player.ty + 0.5) * this.scale;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.restore();
  }
}

export default Minimap;
