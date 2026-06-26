/**
 * SpriteSheet.js — 精灵图帧管理
 *
 * 职责：
 * - 按统一帧尺寸（frameWidth × frameHeight）从一张精灵大图中切出指定帧
 * - 根据动画配置（animations）按名称取帧，支持自动按 fps 播放取当前帧
 * - 用于后续替换占位色块为真实精灵动画（见 assets/SPRITE_SPEC.md）
 *
 * 精灵图布局约定（与 SPRITE_SPEC.md 一致）：
 * - 帧横向排列，每帧 frameWidth × frameHeight
 * - 当一行排满（超过图片宽度）时自动换行，避免单行过长
 * - animations 为对象：{ [name]: { start, frames, fps } }
 *     start  —— 该动画在整张图中的起始帧索引（0 基）
 *     frames —— 该动画包含的帧数
 *     fps    —— 播放帧率（每秒帧数），0 表示单帧不自动推进
 *
 * 与 AssetLoader 的配合：
 *   const ss = new SpriteSheet(assets.getImage('player'), 48, 64, animJson);
 *   const f = ss.getAnimatedFrame('walk_down', elapsedSec);
 *   ctx.drawImage(ss.image, f.sx, f.sy, f.sw, f.sh, dx, dy, f.sw, f.sh);
 */

export class SpriteSheet {
  /**
   * @param {HTMLImageElement|HTMLCanvasElement} image 精灵大图
   * @param {number} frameWidth 单帧宽（像素）
   * @param {number} frameHeight 单帧高（像素）
   * @param {Object<string,{start:number, frames:number, fps:number}>} animations 动画配置
   */
  constructor(image, frameWidth, frameHeight, animations) {
    this.image = image;
    this.frameWidth = frameWidth;
    this.frameHeight = frameHeight;
    /** @type {Object<string,{start:number, frames:number, fps:number}>} */
    this.animations = animations || {};
  }

  /**
   * 取指定动画的第 frameIndex 帧（0 基，自动钳制到合法范围）
   * @param {string} animationName 动画名（如 'walk_down'）
   * @param {number} frameIndex 该动画内的帧索引（0 基）
   * @returns {{sx:number, sy:number, sw:number, sh:number}|null}
   *   返回源图切割矩形；动画名不存在返回 null
   */
  getFrame(animationName, frameIndex) {
    const anim = this.animations[animationName];
    if (!anim) return null;
    const frames = anim.frames > 0 ? anim.frames : 1;
    // 钳制到 [0, frames-1]，避免越界
    let idx = Math.floor(frameIndex);
    if (idx < 0) idx = 0;
    else if (idx >= frames) idx = frames - 1;

    const actualFrame = (anim.start || 0) + idx;
    const { sx, sy } = this._frameIndexToSource(actualFrame);
    return { sx, sy, sw: this.frameWidth, sh: this.frameHeight };
  }

  /**
   * 取指定动画在给定时间点应显示的帧（自动按 fps 循环取帧）
   * @param {string} animationName 动画名
   * @param {number} time 动画累计时间（秒）
   * @returns {{sx:number, sy:number, sw:number, sh:number}|null}
   */
  getAnimatedFrame(animationName, time) {
    const anim = this.animations[animationName];
    if (!anim) return null;
    const frames = anim.frames > 0 ? anim.frames : 1;
    const fps = anim.fps > 0 ? anim.fps : 0;
    let frameIndex;
    if (fps <= 0 || frames <= 1) {
      frameIndex = 0;
    } else {
      const t = time >= 0 ? time : 0;
      frameIndex = Math.floor(t * fps) % frames;
    }
    return this.getFrame(animationName, frameIndex);
  }

  /**
   * 是否存在指定动画
   * @param {string} animationName
   * @returns {boolean}
   */
  hasAnimation(animationName) {
    return !!this.animations[animationName];
  }

  // ===== 内部辅助 =====

  /**
   * 把整张图中的绝对帧索引转为源图坐标
   * 横向排列，超出一行宽度时自动换行
   * @param {number} frameIndex 绝对帧索引（0 基）
   * @returns {{sx:number, sy:number}}
   */
  _frameIndexToSource(frameIndex) {
    const imgW = (this.image && this.image.width) || 0;
    let perRow;
    if (this.frameWidth > 0 && imgW >= this.frameWidth) {
      perRow = Math.floor(imgW / this.frameWidth);
    } else {
      // 图片未加载或尺寸未知：按单行处理，sx 可能超出但 drawImage 会安全失败
      perRow = 0;
    }
    let col, row;
    if (perRow > 0) {
      col = frameIndex % perRow;
      row = Math.floor(frameIndex / perRow);
    } else {
      col = frameIndex;
      row = 0;
    }
    return {
      sx: col * this.frameWidth,
      sy: row * this.frameHeight,
    };
  }
}

export default SpriteSheet;
