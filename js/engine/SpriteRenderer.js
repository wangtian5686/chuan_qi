/**
 * SpriteRenderer.js — 精灵绘制工具集（静态方法）
 *
 * 提供在世界坐标系下绘制精灵、阴影、头顶名字、血条的统一接口。
 * 所有方法均为静态，便于 Scene 与实体直接调用，无需实例化。
 *
 * 坐标约定：
 * - worldX/worldY 为世界像素坐标，由 Camera.worldToScreen 转屏幕坐标后绘制
 * - 锚点 anchorX/anchorY ∈ [0,1]：0.5/1.0 表示底部居中（脚踩地面）
 */

export class SpriteRenderer {
  /**
   * 绘制一个精灵到世界坐标
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./Camera.js').Camera} camera
   * @param {HTMLImageElement|HTMLCanvasElement} image 精灵图（含 9-arg 切片时配合 frame）
   * @param {number} worldX 世界 X
   * @param {number} worldY 世界 Y（精灵脚底所在位置）
   * @param {object} [options]
   * @param {number} [options.anchorX=0.5] X 锚点 0~1（0.5 居中）
   * @param {number} [options.anchorY=1.0] Y 锚点 0~1（1.0 表示脚底，worldY 为脚底）
   * @param {number} [options.scale=1] 缩放
   * @param {number} [options.alpha=1] 透明度
   * @param {{sx:number, sy:number, sw:number, sh:number}} [options.frame] 切片源矩形（精灵图集帧）
   */
  static drawSprite(ctx, camera, image, worldX, worldY, options = {}) {
    if (!image) return;
    const {
      anchorX = 0.5,
      anchorY = 1.0,
      scale = 1,
      alpha = 1,
      frame = null,
    } = options;

    const s = camera.worldToScreen(worldX, worldY);

    let sw, sh;
    if (frame) {
      sw = frame.sw;
      sh = frame.sh;
    } else {
      sw = image.width;
      sh = image.height;
    }
    const dw = sw * scale;
    const dh = sh * scale;

    // 按 anchor 把屏幕点调整为绘制左上角
    const dx = s.x - dw * anchorX;
    const dy = s.y - dh * anchorY;

    const prevAlpha = ctx.globalAlpha;
    if (alpha !== 1) ctx.globalAlpha = alpha;

    if (frame) {
      ctx.drawImage(image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
    } else {
      ctx.drawImage(image, dx, dy, dw, dh);
    }

    if (alpha !== 1) ctx.globalAlpha = prevAlpha;
  }

  /**
   * 绘制椭圆阴影（脚底）
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./Camera.js').Camera} camera
   * @param {number} worldX 世界 X
   * @param {number} worldY 世界 Y（脚底）
   * @param {number} radius 阴影半径（像素，水平方向）
   */
  static drawShadow(ctx, camera, worldX, worldY, radius) {
    const s = camera.worldToScreen(worldX, worldY);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    // 椭圆扁化为 0.4 倍高，模拟俯视投影
    ctx.ellipse(s.x, s.y, radius, radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 绘制头顶名字
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./Camera.js').Camera} camera
   * @param {number} worldX 世界 X
   * @param {number} worldY 世界 Y（脚底）
   * @param {string} name 名字文本
   * @param {string} [color='#ffe9a8'] 名字颜色
   * @param {number} [offsetY] 相对脚底向上偏移（默认 -56，约头顶）
   */
  static drawNameTag(ctx, camera, worldX, worldY, name, color = '#ffe9a8', offsetY = -56) {
    if (!name) return;
    const s = camera.worldToScreen(worldX, worldY);
    const x = s.x;
    const y = s.y + offsetY;

    ctx.save();
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // 黑色描边增强可读性
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(name, x, y);
    ctx.fillStyle = color;
    ctx.fillText(name, x, y);
    ctx.restore();
  }

  /**
   * 绘制血条
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./Camera.js').Camera} camera
   * @param {number} worldX 世界 X
   * @param {number} worldY 世界 Y（脚底）
   * @param {number} ratio 血量比例 0~1
   * @param {number} [width=40] 血条宽
   * @param {number} [offsetY] 相对脚底向上偏移（默认 -44，名字下方）
   */
  static drawHealthBar(ctx, camera, worldX, worldY, ratio, width = 40, offsetY = -44) {
    const s = camera.worldToScreen(worldX, worldY);
    const x = s.x - width / 2;
    const y = s.y + offsetY;
    const h = 5;
    const r = Math.max(0, Math.min(1, ratio));

    ctx.save();
    // 背景
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 1, y - 1, width + 2, h + 2);
    // 空槽
    ctx.fillStyle = '#3a1010';
    ctx.fillRect(x, y, width, h);
    // 血量填充：颜色随比例从红->黄->绿
    let fill;
    if (r > 0.5) {
      fill = '#3aa832'; // 绿
    } else if (r > 0.25) {
      fill = '#d8c020'; // 黄
    } else {
      fill = '#c83020'; // 红
    }
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, width * r, h);
    ctx.restore();
  }
}

export default SpriteRenderer;
