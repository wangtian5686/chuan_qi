/**
 * AssetLoader.js — 资源加载器
 *
 * 负责：
 * - 图片（Image）/ JSON 资源的预加载与缓存
 * - 批量加载并回报整体进度（onProgress(percent, loaded, total)）
 * - 提供占位图生成器 generatePlaceholderImage，纯色 Canvas 精灵，
 *   使骨架阶段无需任何外部资源即可运行。
 *
 * 后续 Task 接入真实资源时，manifest 指向 assets/sprites、assets/tiles 即可。
 */

export class AssetLoader {
  constructor() {
    /** @type {Map<string, HTMLImageElement>} 图片缓存 key -> Image */
    this.images = new Map();
    /** @type {Map<string, any>} JSON 缓存 key -> 解析后对象 */
    this.jsons = new Map();
    /** 进度回调：function(percent, loaded, total) */
    this.onProgress = null;
  }

  /**
   * 加载单张图片
   * @param {string} key 缓存键
   * @param {string} src 图片路径
   * @returns {Promise<HTMLImageElement>}
   */
  loadImage(key, src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.images.set(key, img);
        resolve(img);
      };
      img.onerror = () => reject(new Error(`图片加载失败: ${src}`));
      // 跨域资源若需要导出 canvas 可加 crossOrigin，本地资源无需
      img.src = src;
    });
  }

  /**
   * 加载单个 JSON
   * @param {string} key 缓存键
   * @param {string} src JSON 路径
   * @returns {Promise<any>}
   */
  loadJson(key, src) {
    return fetch(src)
      .then((res) => {
        if (!res.ok) throw new Error(`JSON 加载失败: ${src} (${res.status})`);
        return res.json();
      })
      .then((data) => {
        this.jsons.set(key, data);
        return data;
      });
  }

  /**
   * 批量预加载
   * @param {{images?:Object, jsons?:Object}} manifest
   *   形如 { images: { player: 'assets/sprites/player.png' }, jsons: { ... } }
   * @returns {Promise<void>} 全部完成后 resolve
   */
  preload(manifest) {
    const images = manifest.images || {};
    const jsons = manifest.jsons || {};

    const tasks = [];
    for (const key in images) {
      tasks.push(this.loadImage(key, images[key]));
    }
    for (const key in jsons) {
      tasks.push(this.loadJson(key, jsons[key]));
    }

    const total = tasks.length;
    let loaded = 0;

    // 包装每个任务，完成时上报进度
    const wrapped = tasks.map((p) =>
      p.then((v) => {
        loaded++;
        if (typeof this.onProgress === 'function') {
          const percent = total === 0 ? 100 : Math.floor((loaded / total) * 100);
          this.onProgress(percent, loaded, total);
        }
        return v;
      })
    );

    return Promise.all(wrapped).then(() => {});
  }

  /** 获取已加载图片 */
  getImage(key) {
    return this.images.get(key);
  }

  /** 获取已加载 JSON */
  getJson(key) {
    return this.jsons.get(key);
  }

  /**
   * 动态生成纯色占位精灵图（Canvas），并存入缓存。
   * 用于骨架阶段无外部资源时，让渲染/角色模块有图可用。
   * @param {string} key 缓存键
   * @param {number} w 宽
   * @param {number} h 高
   * @param {string} color 填充色（CSS 颜色字符串）
   * @param {string} [label] 可选：在图上绘制的文字标签
   * @returns {HTMLCanvasElement} 生成的 canvas（可直接作为 drawImage 源）
   */
  generatePlaceholderImage(key, w, h, color, label) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // 主体填充
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);

    // 边框，便于在画面中辨识边界
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    // 可选标签
    if (label) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(10, Math.floor(h / 4))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, h / 2);
    }

    this.images.set(key, canvas);
    return canvas;
  }
}

export default AssetLoader;
