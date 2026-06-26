/**
 * InventoryWindow.js — 背包窗口 UI
 *
 * 职责：
 * - 显示 24 格背包（6 列 × 4 行），每格用物品 color 占位色块 + 数量
 * - 左键：选中 / 拖拽移动（同物品自动合并堆叠，否则交换）
 * - 右键：装备类穿戴、消耗类使用
 * - 鼠标悬停显示 tooltip（名称/属性/耐久/价格）
 *
 * 交互约定：
 * - 鼠标坐标取自 input.mouse.x/y（canvas 内 CSS 像素，与渲染坐标系一致）
 * - update() 返回 true 表示本次点击被窗口消费，调用方据此跳过世界点击处理
 */

import { getItem } from '../data/items.js';
import { equipItem, useItem } from '../game/ItemOps.js';

/** 标题栏高度 */
const TITLE_H = 24;
/** 窗口内边距 */
const PAD = 8;
/** 格子间距 */
const GAP = 2;

/**
 * 将物品 stats 对象格式化为可读属性行
 * @param {object} def 物品定义
 * @returns {string[]}
 */
function formatStats(def) {
  const lines = [];
  if (!def) return lines;
  const s = def.stats || {};
  if (s.minAtk || s.maxAtk) lines.push(`攻击 ${s.minAtk || 0}-${s.maxAtk || 0}`);
  if (s.minMatk || s.maxMatk) lines.push(`魔法 ${s.minMatk || 0}-${s.maxMatk || 0}`);
  if (s.def) lines.push(`防御 +${s.def}`);
  if (s.mdef) lines.push(`魔防 +${s.mdef}`);
  if (s.hp) lines.push(`生命 +${s.hp}`);
  if (s.mp) lines.push(`魔法值 +${s.mp}`);
  if (s.hit) lines.push(`命中 +${s.hit}`);
  if (s.dodge) lines.push(`闪避 +${s.dodge}`);
  if (s.lucky) lines.push(`幸运 +${s.lucky}`);
  if (s.curse) lines.push(`诅咒 +${s.curse}`);
  if (s.moveSpeed) lines.push(`移动速度 +${s.moveSpeed}`);
  if (s.attackSpeed) lines.push(`攻击速度 +${s.attackSpeed}`);
  return lines;
}

export class InventoryWindow {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} player Player 实例
   */
  constructor(canvas, input, player) {
    this.canvas = canvas;
    this.input = input;
    this.player = player;

    /** 是否可见 */
    this.visible = false;
    /** 窗口左上角坐标 */
    this.x = 220;
    this.y = 90;
    /** 格子尺寸 */
    this.slotSize = 32;
    /** 列数 */
    this.cols = 6;
    /** 行数 */
    this.rows = 4;

    /** 当前选中格（-1 表示无） */
    this.selectedSlot = -1;
    /** 拖拽源格（-1 表示无） */
    this.dragSource = -1;
    /** 鼠标悬停格（-1 表示无） */
    this.hoverSlot = -1;

    this._layout();
  }

  /** 计算窗口宽高与格子区起点 */
  _layout() {
    this.w = PAD * 2 + this.cols * this.slotSize + (this.cols - 1) * GAP;
    this.h = TITLE_H + PAD * 2 + this.rows * this.slotSize + (this.rows - 1) * GAP;
    this.slotAreaX = this.x + PAD;
    this.slotAreaY = this.y + TITLE_H + PAD;
  }

  /** 切换显示 */
  toggle() {
    this.visible = !this.visible;
    if (!this.visible) {
      this.selectedSlot = -1;
      this.dragSource = -1;
      this.hoverSlot = -1;
    }
  }

  show() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
    this.selectedSlot = -1;
    this.dragSource = -1;
    this.hoverSlot = -1;
  }

  /** 移动窗口到指定坐标 */
  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this._layout();
  }

  /**
   * 根据鼠标坐标取得所在格索引（-1 表示不在格子上）
   * @param {number} mx
   * @param {my} my
   * @returns {number}
   */
  _getSlotAt(mx, my) {
    if (mx < this.slotAreaX || my < this.slotAreaY) return -1;
    const col = Math.floor((mx - this.slotAreaX) / (this.slotSize + GAP));
    const row = Math.floor((my - this.slotAreaY) / (this.slotSize + GAP));
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
    // 检查是否落在间隙
    const cellX = this.slotAreaX + col * (this.slotSize + GAP);
    const cellY = this.slotAreaY + row * (this.slotSize + GAP);
    if (mx > cellX + this.slotSize || my > cellY + this.slotSize) return -1;
    return row * this.cols + col;
  }

  /** 判断鼠标是否在窗口范围内 */
  _isInWindow(mx, my) {
    return mx >= this.x && mx <= this.x + this.w && my >= this.y && my <= this.y + this.h;
  }

  /**
   * 每帧更新交互
   * @param {number} dt 帧间隔（秒）
   * @param {object} input Input 实例
   * @returns {boolean} 是否消费了本帧鼠标点击
   */
  update(dt, input) {
    if (!this.visible) return false;
    const inv = this.player && this.player.inventory;
    if (!inv) return false;

    const mouse = input.getMouse();
    const mx = mouse.x;
    const my = mouse.y;
    const inWindow = this._isInWindow(mx, my);

    // 悬停格
    this.hoverSlot = inWindow ? this._getSlotAt(mx, my) : -1;

    let consumed = false;

    // 左键按下：开始拖拽 / 选中
    if (mouse.leftPressed && inWindow) {
      const slot = this._getSlotAt(mx, my);
      if (slot >= 0) {
        this.dragSource = slot;
        this.selectedSlot = slot;
        consumed = true;
      } else {
        consumed = true; // 点在窗口空白处也消费，避免穿透
      }
    }

    // 左键释放：完成拖拽移动
    if (this.dragSource >= 0 && !mouse.leftDown) {
      const target = this._getSlotAt(mx, my);
      if (target >= 0 && target !== this.dragSource) {
        inv.moveItem(this.dragSource, target);
      }
      this.dragSource = -1;
    }

    // 右键按下：使用 / 穿戴
    if (mouse.rightPressed && inWindow) {
      const slot = this._getSlotAt(mx, my);
      if (slot >= 0) {
        const stack = inv.getSlot(slot);
        if (stack) {
          const def = getItem(stack.itemId);
          if (def) {
            if (def.slot) {
              // 装备 -> 穿戴
              equipItem(this.player, slot);
            } else {
              // 消耗品 -> 使用
              useItem(this.player, slot);
            }
          }
        }
        consumed = true;
      } else {
        consumed = true;
      }
    }

    return consumed;
  }

  /** 绘制窗口 */
  render(ctx) {
    if (!this.visible) return;
    const inv = this.player && this.player.inventory;

    ctx.save();

    // 窗口背景
    ctx.fillStyle = 'rgba(20, 18, 26, 0.92)';
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
    ctx.fillText('背包', this.x + PAD, this.y + TITLE_H / 2);

    // 背包占用提示（右上角）
    if (inv) {
      let used = 0;
      for (const s of inv.slots) if (s) used++;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#a89878';
      ctx.fillText(`${used}/${this.cols * this.rows}`, this.x + this.w - PAD, this.y + TITLE_H / 2);
    }

    // 绘制 24 格
    if (inv) {
      for (let i = 0; i < this.cols * this.rows; i++) {
        this._drawSlot(ctx, i, inv.getSlot(i));
      }
    } else {
      ctx.fillStyle = '#a89878';
      ctx.textAlign = 'center';
      ctx.fillText('无背包数据', this.x + this.w / 2, this.y + this.h / 2);
    }

    ctx.restore();

    // tooltip（独立 save/restore，绘制在窗口之上）
    if (this.hoverSlot >= 0 && inv) {
      const stack = inv.getSlot(this.hoverSlot);
      if (stack) this._drawTooltip(ctx, stack);
    }
  }

  /** 绘制单个格子 */
  _drawSlot(ctx, index, stack) {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    const sx = this.slotAreaX + col * (this.slotSize + GAP);
    const sy = this.slotAreaY + row * (this.slotSize + GAP);
    const size = this.slotSize;

    // 格子底色
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(sx, sy, size, size);
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);

    if (stack) {
      const def = getItem(stack.itemId);
      const color = (def && def.color) || '#888888';

      // 损坏装备置灰
      if (def && def.maxDurability && (stack.durability != null) && stack.durability <= 0) {
        ctx.globalAlpha = 0.4;
      }

      // 物品占位色块
      ctx.fillStyle = color;
      ctx.fillRect(sx + 3, sy + 3, size - 6, size - 6);

      ctx.globalAlpha = 1;

      // 数量（堆叠 > 1 时显示）
      if (stack.count > 1) {
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        const txt = String(stack.count);
        ctx.strokeText(txt, sx + size - 2, sy + size - 1);
        ctx.fillText(txt, sx + size - 2, sy + size - 1);
      }
    }

    // 选中 / 悬停高亮
    if (index === this.selectedSlot) {
      ctx.strokeStyle = '#ffd060';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
    } else if (index === this.hoverSlot) {
      ctx.strokeStyle = '#a8c8ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
    }

    // 拖拽源标记
    if (index === this.dragSource) {
      ctx.strokeStyle = '#60ff60';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
      ctx.setLineDash([]);
    }
  }

  /** 绘制物品 tooltip */
  _drawTooltip(ctx, stack) {
    const def = getItem(stack.itemId);
    if (!def) return;

    const mouse = this.input.getMouse();
    const lines = [];
    lines.push({ text: def.name, color: '#ffe060', bold: true });

    // 类型 / 槽位
    if (def.slot) {
      lines.push({ text: `装备 · ${this._slotLabel(def.slot)}`, color: '#a8c8ff' });
    } else if (def.type) {
      lines.push({ text: this._typeLabel(def.type), color: '#a8c8ff' });
    }

    // 职业限制
    if (def.classRestriction && def.classRestriction.length) {
      lines.push({ text: `职业: ${def.classRestriction.join('/')}`, color: '#d0a0a0' });
    }
    if (def.levelRestriction) {
      lines.push({ text: `需要等级: ${def.levelRestriction}`, color: '#d0a0a0' });
    }

    // 属性
    for (const line of formatStats(def)) {
      lines.push({ text: line, color: '#80e080' });
    }

    // 特殊效果
    if (def.special) {
      lines.push({ text: `特殊: ${def.special}`, color: '#c080ff' });
    }

    // 耐久
    if (def.maxDurability) {
      const cur = stack.durability != null ? stack.durability : def.maxDurability;
      const durColor = cur <= 0 ? '#ff6060' : (cur <= def.maxDurability * 0.25 ? '#ffa060' : '#c0c0c0');
      lines.push({ text: `耐久 ${cur}/${def.maxDurability}`, color: durColor });
    }

    // 价格
    if (def.price) {
      lines.push({ text: `价格 ${def.price}（出售 ${Math.floor(def.price / 2)}）`, color: '#e8d8a8' });
    }

    // 描述
    if (def.description) {
      lines.push({ text: def.description, color: '#a89878' });
    }

    // 堆叠数量
    if (stack.count > 1) {
      lines.push({ text: `数量 ×${stack.count}`, color: '#ffffff' });
    }

    // 计算尺寸
    ctx.save();
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    let maxW = 0;
    for (const l of lines) {
      const w = ctx.measureText(l.text).width;
      if (w > maxW) maxW = w;
    }
    const padX = 8;
    const padY = 6;
    const lineH = 15;
    const boxW = Math.ceil(maxW) + padX * 2;
    const boxH = lines.length * lineH + padY * 2;

    // 定位（默认在鼠标右下，靠近边界则翻转）
    let bx = mouse.x + 14;
    let by = mouse.y + 14;
    // canvas.width 为设备像素，按 dpr 换算为 CSS 像素与鼠标坐标系对齐
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const cw = this.canvas.width / dpr;
    const ch = this.canvas.height / dpr;
    if (bx + boxW > cw) bx = mouse.x - boxW - 14;
    if (by + boxH > ch) by = mouse.y - boxH - 14;
    bx = Math.max(2, bx);
    by = Math.max(2, by);

    // 背景
    ctx.fillStyle = 'rgba(10, 8, 14, 0.96)';
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

    // 文本
    let ty = by + padY;
    for (const l of lines) {
      ctx.fillStyle = l.color;
      ctx.font = l.bold ? 'bold 12px monospace' : '12px monospace';
      ctx.fillText(l.text, bx + padX, ty);
      ty += lineH;
    }
    ctx.restore();
  }

  /** 槽位 id 转中文标签 */
  _slotLabel(slot) {
    const map = {
      weapon: '武器', armor: '衣服', helmet: '头盔', necklace: '项链',
      ring: '戒指', bracelet: '手镯', belt: '腰带', boots: '靴子',
    };
    return map[slot] || slot;
  }

  /** 物品类型转中文标签 */
  _typeLabel(type) {
    const map = { potion: '药水', scroll: '卷轴' };
    return map[type] || type;
  }
}

export default InventoryWindow;
