/**
 * Hud.js — 主游戏 HUD
 *
 * 职责：
 * - 组合 SkillBar 与 Minimap，作为 PLAYING 状态下的常驻界面层
 * - 顶部左：HP 红色球（半径 40px，圆形渐变填充，比例 = hp/maxHp）
 * - 顶部右：MP 蓝色球（半径 40px，比例 = mp/maxMp）
 * - 顶部中央：经验条（宽 400px，渐变填充，显示 等级 + 经验百分比）
 * - 顶部右侧：金币显示
 * - 左下角：玩家坐标 "X: tx, Y: ty, 地图名"
 * - 右上角：FPS（由 game 传入）
 * - 委派 skillBar.render / minimap.render
 *
 * Player 接口约定（与 EquipmentWindow 一致）：
 *   - player.stats.hp / mp / maxHp / maxMp（主数据源）
 *   - player.hp / mp / maxHp / maxMp（回退）
 *   - player.level / player.exp / player.getExpToNext()
 *   - player.gold / player.tx / player.ty
 *
 * 怪物列表：每帧从 game.scene.monsters 同步到 minimap.monsters，
 *   若 game.scene 缺省则保持上一次值。
 */

import { SkillBar } from './SkillBar.js';
import { Minimap } from './Minimap.js';

/** 球体半径 */
const ORB_R = 40;
/** 球体边距 */
const ORB_PAD = 12;
/** 经验条宽度 */
const EXP_BAR_W = 400;
/** 经验条高度 */
const EXP_BAR_H = 14;

export class Hud {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} game Game 单例（提供 camera / scene / fps 等）
   */
  constructor(canvas, input, game) {
    this.canvas = canvas;
    this.input = input;
    this.game = game;

    /** 子组件 */
    this.skillBar = new SkillBar(canvas, input, game);
    this.minimap = new Minimap(canvas);

    /** HUD 是否可见（PLAYING 状态下恒为 true） */
    this.visible = true;
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

  /** 安全取数字（非有限数返回 0） */
  _num(v) {
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }

  /**
   * 取玩家当前 / 上限 HP
   * 优先用 stats（Player.js 的真实数据源）；顶层 hp/maxHp 仅在为有限数时采用
   */
  _getHp(player) {
    const s = (player && player.stats) || {};
    const cur = this._pick(player && player.hp, s.hp);
    const max = this._pick(player && player.maxHp, s.maxHp);
    return { cur, max };
  }

  /** 取玩家当前 / 上限 MP（同 HP 取值策略） */
  _getMp(player) {
    const s = (player && player.stats) || {};
    const cur = this._pick(player && player.mp, s.mp);
    const max = this._pick(player && player.maxMp, s.maxMp);
    return { cur, max };
  }

  /** 优先取有限数 primary，否则回退 fallback */
  _pick(primary, fallback) {
    if (typeof primary === 'number' && isFinite(primary)) return primary;
    if (typeof fallback === 'number' && isFinite(fallback)) return fallback;
    return 0;
  }

  /**
   * 每帧更新：同步怪物列表到小地图 + 委派子组件
   * @param {number} dt 秒
   * @param {object} input Input 实例
   * @param {object} player Player 实例
   */
  update(dt, input, player) {
    if (!this.visible) return;

    // 同步场景怪物列表到小地图
    const scene = this.game && this.game.scene;
    if (scene && scene.monsters) {
      this.minimap.monsters = scene.monsters;
    }

    this.skillBar.update(dt, input, player);
    this.minimap.update(dt, player);
  }

  /**
   * 渲染 HUD
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} player Player 实例
   * @param {object} camera Camera 实例
   * @param {object} map IsometricMap 实例
   */
  render(ctx, player, camera, map) {
    if (!this.visible) return;

    const { w: vw, h: vh } = this._cssSize();

    // HP 球（左上）
    const hpX = ORB_PAD + ORB_R;
    const hpY = ORB_PAD + ORB_R;
    this._drawOrb(ctx, hpX, hpY, ORB_R, this._getHp(player), '#ff4040', '#600000', 'HP');

    // MP 球（右上，留出小地图空间；小地图在 y=100 起，球放在其上方）
    const mpX = vw - ORB_PAD - ORB_R;
    const mpY = ORB_PAD + ORB_R;
    this._drawOrb(ctx, mpX, mpY, ORB_R, this._getMp(player), '#4080ff', '#001040', 'MP');

    // 经验条（顶部中央）
    const expX = Math.floor((vw - EXP_BAR_W) / 2);
    const expY = ORB_PAD;
    this._drawExpBar(ctx, expX, expY, EXP_BAR_W, EXP_BAR_H, player);

    // 金币显示（顶部右侧，MP 球下方）
    const gold = this._num(player && player.gold);
    ctx.save();
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffd060';
    ctx.fillText(`金币 ${gold}`, vw - ORB_PAD, ORB_PAD + ORB_R * 2 + 6);
    ctx.restore();

    // FPS（右上角顶部，MP 球左侧）
    const fps = this._num(this.game && this.game.fps);
    if (fps > 0) {
      ctx.save();
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#a8c8ff';
      ctx.fillText(`FPS ${fps}`, vw - ORB_PAD - ORB_R * 2 - 8, ORB_PAD + 4);
      ctx.restore();
    }

    // 玩家坐标（左下角）
    if (player) {
      const tx = this._num(player.tx);
      const ty = this._num(player.ty);
      const mapName = (map && map.name) || (player.mapId || '');
      ctx.save();
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = '#e8d8a8';
      ctx.fillText(`X: ${tx}, Y: ${ty}  ${mapName}`, 8, vh - 4);
      ctx.restore();
    }

    // 技能栏（底部居中）
    this.skillBar.render(ctx, player);

    // 小地图（右上角）
    this.minimap.render(ctx, player, camera, map);
  }

  /**
   * 绘制球体（HP / MP）
   * - 外圈描边
   * - 背景深色圆
   * - 按比例自下而上渐变填充（圆形渐变：底部深 → 顶部亮）
   * - 中央文字 cur / max
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} cx 圆心 X
   * @param {number} cy 圆心 Y
   * @param {number} r 半径
   * @param {{cur:number, max:number}} val 当前 / 上限
   * @param {string} lightColor 亮色（顶部）
   * @param {string} darkColor 暗色（底部）
   * @param {string} label 标签（HP / MP）
   */
  _drawOrb(ctx, cx, cy, r, val, lightColor, darkColor, label) {
    const ratio = val.max > 0 ? Math.max(0, Math.min(1, val.cur / val.max)) : 0;

    ctx.save();

    // 外圈描边
    ctx.beginPath();
    ctx.arc(cx, cy, r + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 背景深色圆
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1018';
    ctx.fill();

    // 按比例填充：裁剪到圆形，自下而上画矩形到 fillHeight
    const fillH = r * 2 * ratio;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    // 渐变：底部 darkColor → 顶部 lightColor
    const grad = ctx.createLinearGradient(cx, cy + r, cx, cy - r);
    grad.addColorStop(0, darkColor);
    grad.addColorStop(1, lightColor);
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy + r - fillH, r * 2, fillH);
    ctx.restore();

    // 高光（左上小圆，增加立体感）
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.22, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.fill();

    // 中央文字：cur / max
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 3;
    const txt = `${Math.floor(val.cur)}/${Math.floor(val.max)}`;
    ctx.strokeText(txt, cx, cy);
    ctx.fillText(txt, cx, cy);

    // 标签（球体上方）
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#e8d8a8';
    ctx.fillText(label, cx, cy - r - 8);

    ctx.restore();
  }

  /**
   * 绘制经验条
   * - 半透明背景框 + 渐变填充（左暗 → 右亮）
   * - 显示 等级 与 经验百分比
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} x 左上角 X
   * @param {number} y 左上角 Y
   * @param {number} w 宽度
   * @param {number} h 高度
   * @param {object} player Player 实例
   */
  _drawExpBar(ctx, x, y, w, h, player) {
    const level = this._num(player && player.level);
    const exp = this._num(player && player.exp);
    const need = player && typeof player.getExpToNext === 'function'
      ? this._num(player.getExpToNext())
      : 0;
    const ratio = need > 0 ? Math.max(0, Math.min(1, exp / need)) : 0;

    ctx.save();

    // 标签：等级 + 经验百分比（条上方）
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#ffe060';
    const pct = need > 0 ? Math.floor(ratio * 100) : 0;
    ctx.fillText(`Lv.${level}  经验 ${pct}%`, x + w / 2, y - 2);

    // 背景框
    ctx.fillStyle = 'rgba(20, 18, 26, 0.85)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // 渐变填充
    if (ratio > 0) {
      const grad = ctx.createLinearGradient(x, y, x + w, y);
      grad.addColorStop(0, '#504020');
      grad.addColorStop(0.5, '#c89030');
      grad.addColorStop(1, '#ffe060');
      ctx.fillStyle = grad;
      ctx.fillRect(x + 1, y + 1, (w - 2) * ratio, h - 2);
    }

    ctx.restore();
  }
}

export default Hud;
