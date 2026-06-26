/**
 * CharacterWindow.js — 角色面板 UI（C 键切换）
 *
 * 职责：
 * - 顶部展示：角色名 / 职业 / 等级 / 经验 / PK 值 / 金币
 * - 详细属性区：HP / MP / 攻击 / 魔攻 / 防御 / 魔防 / 命中 / 闪避 / 幸运 / 诅咒 /
 *   攻击距离 / 攻击速度 / 移动速度
 * - 套装加成区：列出当前激活的套装（沿用 EquipmentWindow 的格式）
 * - 装备槽缩略图区：10 个装备槽小图，点击某个槽 → 触发 onOpenEquipment(slot) 回调
 *   （由 UiManager 注入，打开装备面板并定位到对应槽）
 *
 * 复用：
 * - items.js 的 checkSetBonus / SET_BONUS / getItem
 * - classes.js 的 getClass
 * - Equipment.js 的 getSlot / getEquippedItemIds
 *
 * Player 接口约定（与 EquipmentWindow 一致）：
 *   - player.name / player.classId / player.level / player.exp / player.getExpToNext()
 *   - player.pkValue / player.gold
 *   - player.stats : { hp, mp, maxHp, maxMp, minAtk, maxAtk, minMatk, maxMatk,
 *                      def, mdef, hit, dodge, lucky, curse, moveSpeed, attackRange,
 *                      attackSpeed }
 *   - player.hp / mp / maxHp / maxMp（回退源）
 *   - player.equipment : Equipment
 *
 * 交互约定：update() 返回 true 表示本次点击被窗口消费。
 */

import { getItem, checkSetBonus, SET_BONUS } from '../data/items.js';
import { getClass } from '../data/classes.js';

const TITLE_H = 24;
const PAD = 8;
const CLOSE_SIZE = 18;
const LINE_H = 17;
const SLOT_SIZE = 30;
const SLOT_GAP = 4;
/** 装备槽缩略图布局（沿用 EquipmentWindow 顺序） */
const EQUIP_LAYOUT = [
  { slot: 'helmet', label: '头' },
  { slot: 'necklace', label: '颈' },
  { slot: 'weapon', label: '武' },
  { slot: 'armor', label: '衣' },
  { slot: 'ringLeft', label: '戒L' },
  { slot: 'ringRight', label: '戒R' },
  { slot: 'braceletLeft', label: '镯L' },
  { slot: 'braceletRight', label: '镯R' },
  { slot: 'belt', label: '腰' },
  { slot: 'boots', label: '靴' },
];
/** 缩略图区一行 5 个，共 2 行 */
const SLOT_COLS = 5;

export class CharacterWindow {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} player Player 实例
   */
  constructor(canvas, input, player) {
    this.canvas = canvas;
    this.input = input;
    this.player = player;

    this.visible = false;
    this.x = 60;
    this.y = 80;
    this.w = 350;
    this.h = 500;

    /** 悬停的装备槽名（null 表示无） */
    this.hoverSlot = null;

    /**
     * 点击装备槽回调：onOpenEquipment(slotName|null)
     * 由 UiManager 注入，用于切换到装备面板。点击空白时传 null。
     */
    this.onOpenEquipment = null;

    this._layout();
  }

  _layout() {
    this.closeX = this.x + this.w - CLOSE_SIZE - PAD;
    this.closeY = this.y + (TITLE_H - CLOSE_SIZE) / 2;
    this.contentY = this.y + TITLE_H + PAD;
    // 内容区起始
    this.headerY = this.contentY;
    this.statsY = this.headerY + LINE_H * 4 + 6;
    // 装备槽区位置（底部，2 行）
    this.slotAreaH = 2 * SLOT_SIZE + SLOT_GAP;
    this.slotY = this.y + this.h - PAD - this.slotAreaH;
    // 套装区位于装备槽上方
    this.setBonusY = this.slotY - LINE_H - 6;
  }

  show() { this.visible = true; }
  hide() {
    this.visible = false;
    this.hoverSlot = null;
  }
  toggle() {
    this.visible = !this.visible;
    if (!this.visible) this.hide();
  }
  setPosition(x, y) { this.x = x; this.y = y; this._layout(); }

  _isInWindow(mx, my) {
    return mx >= this.x && mx <= this.x + this.w && my >= this.y && my <= this.y + this.h;
  }

  _inCloseBtn(mx, my) {
    return mx >= this.closeX && mx <= this.closeX + CLOSE_SIZE &&
      my >= this.closeY && my <= this.closeY + CLOSE_SIZE;
  }

  /** 取装备槽缩略图矩形（屏幕坐标） */
  _slotRect(i) {
    const col = i % SLOT_COLS;
    const row = Math.floor(i / SLOT_COLS);
    const totalW = SLOT_COLS * SLOT_SIZE + (SLOT_COLS - 1) * SLOT_GAP;
    const startX = this.x + Math.floor((this.w - totalW) / 2);
    const sx = startX + col * (SLOT_SIZE + SLOT_GAP);
    const sy = this.slotY + row * (SLOT_SIZE + SLOT_GAP);
    return { x: sx, y: sy, w: SLOT_SIZE, h: SLOT_SIZE };
  }

  /** 取鼠标所在装备槽名（null 表示不在槽上） */
  _getSlotAt(mx, my) {
    for (let i = 0; i < EQUIP_LAYOUT.length; i++) {
      const r = this._slotRect(i);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        return EQUIP_LAYOUT[i].slot;
      }
    }
    return null;
  }

  /** 安全取数字 */
  _num(v) {
    return typeof v === 'number' && !isNaN(v) ? v : 0;
  }

  /**
   * 每帧更新交互
   * @param {number} dt 秒
   * @param {object} input Input 实例
   * @returns {boolean} 是否消费了本帧鼠标点击
   */
  update(dt, input) {
    if (!this.visible) return false;
    const inp = input || this.input;
    const mouse = inp.getMouse();
    const mx = mouse.x;
    const my = mouse.y;
    const inWindow = this._isInWindow(mx, my);

    this.hoverSlot = inWindow ? this._getSlotAt(mx, my) : null;

    let consumed = false;

    if (mouse.leftPressed && inWindow) {
      if (this._inCloseBtn(mx, my)) { this.hide(); return true; }
      const slot = this._getSlotAt(mx, my);
      if (slot && typeof this.onOpenEquipment === 'function') {
        // 点击装备槽 → 通知外部打开装备面板
        this.onOpenEquipment(slot);
      }
      consumed = true;
    }

    return consumed;
  }

  /** 绘制 */
  render(ctx) {
    if (!this.visible) return;

    ctx.save();
    // 窗口背景
    ctx.fillStyle = 'rgba(20, 18, 26, 0.94)';
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 2;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeRect(this.x, this.y, this.w, this.h);

    // 标题栏
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(this.x, this.y, this.w, TITLE_H);
    ctx.fillStyle = '#e8d8a8';
    ctx.font = 'bold 14px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('角色', this.x + PAD, this.y + TITLE_H / 2);

    this._drawCloseButton(ctx);
    this._drawHeader(ctx);
    this._drawStats(ctx);
    this._drawSetBonus(ctx);
    this._drawEquipSlots(ctx);

    ctx.restore();
  }

  _drawCloseButton(ctx) {
    const x = this.closeX, y = this.closeY;
    ctx.fillStyle = '#5a2a1a';
    ctx.fillRect(x, y, CLOSE_SIZE, CLOSE_SIZE);
    ctx.strokeStyle = '#e8d8a8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + 4, y + 4);
    ctx.lineTo(x + CLOSE_SIZE - 4, y + CLOSE_SIZE - 4);
    ctx.moveTo(x + CLOSE_SIZE - 4, y + 4);
    ctx.lineTo(x + 4, y + CLOSE_SIZE - 4);
    ctx.stroke();
  }

  /** 顶部：角色名 / 职业 / 等级 / 经验 / PK / 金币 */
  _drawHeader(ctx) {
    const p = this.player || {};
    const cls = getClass(p.classId);
    const className = cls ? cls.name : (p.classId || '');
    const level = this._num(p.level);
    const exp = this._num(p.exp);
    const need = p && typeof p.getExpToNext === 'function' ? this._num(p.getExpToNext()) : 0;
    const pk = this._num(p.pkValue);
    const gold = this._num(p.gold);

    const lines = [
      { label: '名字', value: p.name || '', color: '#ffe060' },
      { label: '职业', value: className, color: '#e8d8a8' },
      { label: '等级', value: `Lv.${level}`, color: '#e8d8a8' },
      { label: '经验', value: need > 0 ? `${exp} / ${need}` : `${exp}`, color: '#80a0ff' },
    ];

    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    let y = this.headerY;
    for (const ln of lines) {
      ctx.fillStyle = '#a89878';
      ctx.fillText(ln.label, this.x + PAD, y);
      ctx.fillStyle = ln.color;
      ctx.fillText(ln.value, this.x + PAD + 48, y);
      y += LINE_H;
    }
    // 第二列：PK / 金币
    y = this.headerY;
    const col2X = this.x + this.w / 2 + 8;
    ctx.fillStyle = '#a89878';
    ctx.fillText('PK', col2X, y);
    ctx.fillStyle = pk > 0 ? '#ff6060' : '#c0c0c0';
    ctx.fillText(String(pk), col2X + 48, y);
    y += LINE_H;
    ctx.fillStyle = '#a89878';
    ctx.fillText('金币', col2X, y);
    ctx.fillStyle = '#ffd060';
    ctx.fillText(String(gold), col2X + 48, y);

    // 分隔线
    y = this.headerY + LINE_H * 4 + 2;
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x + PAD, y);
    ctx.lineTo(this.x + this.w - PAD, y);
    ctx.stroke();
  }

  /** 详细属性区 */
  _drawStats(ctx) {
    const p = this.player || {};
    const stats = p.stats || {};
    const curHp = this._num(p.hp != null ? p.hp : stats.hp);
    const maxHp = this._num(p.maxHp != null ? p.maxHp : stats.maxHp);
    const curMp = this._num(p.mp != null ? p.mp : stats.mp);
    const maxMp = this._num(p.maxMp != null ? p.maxMp : stats.maxMp);

    const rows = [
      { label: '生命', value: `${curHp} / ${maxHp}`, color: '#ff8080' },
      { label: '魔法', value: `${curMp} / ${maxMp}`, color: '#80a0ff' },
      { label: '攻击', value: `${this._num(stats.minAtk)} - ${this._num(stats.maxAtk)}`, color: '#ffe060' },
      { label: '魔攻', value: `${this._num(stats.minMatk)} - ${this._num(stats.maxMatk)}`, color: '#c080ff' },
      { label: '防御', value: String(this._num(stats.def)), color: '#a0c0ff' },
      { label: '魔防', value: String(this._num(stats.mdef)), color: '#a0ffc0' },
      { label: '命中', value: String(this._num(stats.hit)), color: '#e0e0e0' },
      { label: '闪避', value: String(this._num(stats.dodge)), color: '#e0e0e0' },
      { label: '幸运', value: String(this._num(stats.lucky)), color: '#80ff80' },
      { label: '诅咒', value: String(this._num(stats.curse)), color: '#a06060' },
      { label: '攻击距离', value: String(this._num(stats.attackRange)), color: '#c0c0c0' },
      { label: '攻击速度', value: String(this._num(stats.attackSpeed)), color: '#c0c0c0' },
      { label: '移动速度', value: String(this._num(stats.moveSpeed)), color: '#c0c0c0' },
    ];

    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    let y = this.statsY;
    // 两列布局：左 7 行，右 6 行
    const half = Math.ceil(rows.length / 2);
    for (let i = 0; i < rows.length; i++) {
      const col = i < half ? 0 : 1;
      const rowIdx = i < half ? i : (i - half);
      const lx = this.x + PAD + col * (this.w / 2);
      const ry = this.statsY + rowIdx * LINE_H;
      ctx.fillStyle = '#a89878';
      ctx.textAlign = 'left';
      ctx.fillText(rows[i].label, lx, ry);
      ctx.fillStyle = rows[i].color;
      ctx.textAlign = 'right';
      ctx.fillText(rows[i].value, lx + this.w / 2 - PAD, ry);
    }
    y = this.statsY + half * LINE_H + 6;

    // 分隔线
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.textAlign = 'left';
    ctx.beginPath();
    ctx.moveTo(this.x + PAD, y);
    ctx.lineTo(this.x + this.w - PAD, y);
    ctx.stroke();
  }

  /** 套装加成区 */
  _drawSetBonus(ctx) {
    const p = this.player || {};
    const eq = p.equipment;
    const activeSets = eq ? checkSetBonus(eq.getEquippedItemIds()) : [];

    ctx.font = 'bold 12px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e8d8a8';
    ctx.fillText('套装加成', this.x + PAD, this.setBonusY);

    ctx.font = '12px monospace';
    if (activeSets.length === 0) {
      ctx.fillStyle = '#6a5a3a';
      ctx.fillText('（未激活）', this.x + PAD + 70, this.setBonusY);
    } else {
      let x = this.x + PAD + 70;
      for (const set of activeSets) {
        const def = SET_BONUS[set.setName];
        const name = def ? def.name : set.setName;
        ctx.fillStyle = '#ffd060';
        ctx.fillText(`◆ ${name}`, x, this.setBonusY);
        x += ctx.measureText(`◆ ${name}  `).width + 10;
      }
    }
  }

  /** 装备槽缩略图区 */
  _drawEquipSlots(ctx) {
    const eq = this.player && this.player.equipment;

    // 区块标题
    ctx.font = 'bold 12px monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#a89878';
    ctx.fillText('装备（点击打开装备面板）', this.x + PAD, this.slotY - 4);

    for (let i = 0; i < EQUIP_LAYOUT.length; i++) {
      const { slot, label } = EQUIP_LAYOUT[i];
      const r = this._slotRect(i);

      // 槽底
      ctx.fillStyle = '#1a1620';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      const equipped = eq ? eq.getSlot(slot) : null;
      if (equipped) {
        const def = getItem(equipped.itemId);
        const color = (def && def.color) || '#888888';
        // 损坏置灰
        if (def && def.maxDurability && equipped.durability != null && equipped.durability <= 0) {
          ctx.globalAlpha = 0.4;
        }
        ctx.fillStyle = color;
        ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
        ctx.globalAlpha = 1;
      } else {
        // 空槽显示中文标签
        ctx.fillStyle = '#4a3a2a';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2);
      }

      // 悬停高亮
      if (this.hoverSlot === slot) {
        ctx.strokeStyle = '#a8c8ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
    }
  }
}

export default CharacterWindow;
