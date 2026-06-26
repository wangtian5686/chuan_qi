/**
 * RepairWindow.js — 铁匠修理窗口 UI
 *
 * 职责：
 * - 列出身上所有装备：图标 + 名字 + 耐久条 + 当前/最大耐久 + 单件修理费
 * - 单件"修理"按钮：校验金币后修理该件（耐久回满，扣金币）
 * - "全部修理"按钮：调用 ItemOps.repairAll（内部校验金币）
 * - 显示总修理费与玩家金币；列表支持滚轮滚动
 *
 * 修理费公式（与 ItemOps 一致）：
 *   cost = max(1, floor(price × 耐久损失比例 × 0.25))
 */

import { getItem } from '../data/items.js';
import { repairItem, repairAll } from '../game/ItemOps.js';

const TITLE_H = 24;
const PAD = 8;
const ROW_H = 36;
const CLOSE_SIZE = 18;
const BOTTOM_H = 70;
/** 修理费系数（与 ItemOps.REPAIR_PRICE_FACTOR 一致） */
const REPAIR_FACTOR = 0.25;

export class RepairWindow {
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
    this.x = 420;
    this.y = 80;
    this.w = 350;
    this.h = 400;

    /** 列表滚动偏移（行数） */
    this.scroll = 0;
    /** 反馈消息 */
    this.message = '';
    this.messageTimer = 0;

    this._layout();
  }

  _layout() {
    this.listY = this.y + TITLE_H + PAD;
    this.listH = this.h - TITLE_H - PAD - BOTTOM_H;
    this.bottomY = this.y + this.h - BOTTOM_H;
    this.closeX = this.x + this.w - CLOSE_SIZE - PAD;
    this.closeY = this.y + (TITLE_H - CLOSE_SIZE) / 2;
    this.repairAllBtn = {
      x: this.x + PAD,
      y: this.bottomY + 22,
      w: this.w - PAD * 2,
      h: 26,
    };
  }

  show() { this.visible = true; }
  hide() { this.visible = false; this.message = ''; this.messageTimer = 0; }
  toggle() {
    this.visible = !this.visible;
    if (!this.visible) this.hide();
  }
  setPosition(x, y) { this.x = x; this.y = y; this._layout(); }

  _isInWindow(mx, my) {
    return mx >= this.x && mx <= this.x + this.w && my >= this.y && my <= this.y + this.h;
  }

  /** 收集身上所有装备行（含耐久与单件修理费） */
  _getRows() {
    const eq = this.player && this.player.equipment;
    const rows = [];
    if (!eq) return rows;
    eq.forEachEquipped((slot, item) => {
      const def = getItem(item.itemId);
      if (!def || !def.maxDurability) return;
      const cur = item.durability != null ? item.durability : def.maxDurability;
      rows.push({
        slot, item, def,
        name: def.name,
        color: def.color || '#888888',
        cur,
        max: def.maxDurability,
        cost: this._repairCost(def, cur),
        needRepair: cur < def.maxDurability,
      });
    });
    return rows;
  }

  /** 单件修理费（与 ItemOps.repairItem 口径一致） */
  _repairCost(def, cur) {
    if (!def || !def.maxDurability) return 0;
    if (cur >= def.maxDurability) return 0;
    const loss = def.maxDurability - cur;
    return Math.max(1, Math.floor(def.price * (loss / def.maxDurability) * REPAIR_FACTOR));
  }

  _totalCost() {
    let total = 0;
    for (const r of this._getRows()) total += r.cost;
    return total;
  }

  _visibleRowCount() {
    return Math.max(0, Math.floor(this.listH / ROW_H));
  }

  _clampScroll() {
    const rows = this._getRows();
    const maxScroll = Math.max(0, rows.length - this._visibleRowCount());
    if (this.scroll < 0) this.scroll = 0;
    if (this.scroll > maxScroll) this.scroll = maxScroll;
  }

  _inCloseBtn(mx, my) {
    return mx >= this.closeX && mx <= this.closeX + CLOSE_SIZE &&
      my >= this.closeY && my <= this.closeY + CLOSE_SIZE;
  }

  _inRepairAllBtn(mx, my) {
    const b = this.repairAllBtn;
    return mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h;
  }

  /** 取得行索引（点击落在该行的"修理"按钮区域内才返回，否则 -1） */
  _getRowBtnAt(mx, my) {
    const btnW = 50, btnH = 26;
    for (let i = 0; i < this._visibleRowCount(); i++) {
      const rowIdx = i + this.scroll;
      const ry = this.listY + i * ROW_H;
      const bx = this.x + this.w - PAD - btnW;
      const by = ry + (ROW_H - btnH) / 2;
      if (mx >= bx && mx <= bx + btnW && my >= by && my <= by + btnH) {
        return rowIdx;
      }
    }
    return -1;
  }

  /**
   * 每帧更新交互
   * @returns {boolean} 是否消费了本帧鼠标点击
   */
  update(dt, input) {
    if (!this.visible) return false;
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = '';
    }
    const inp = input || this.input;
    const mouse = inp.getMouse();
    const mx = mouse.x, my = mouse.y;
    const inWindow = this._isInWindow(mx, my);

    let consumed = false;

    // 滚轮滚动
    if (inWindow && typeof inp.getWheelDelta === 'function') {
      const wheel = inp.getWheelDelta();
      if (wheel > 0) { this.scroll++; consumed = true; }
      else if (wheel < 0) { this.scroll--; consumed = true; }
      this._clampScroll();
    }

    if (mouse.leftPressed && inWindow) {
      if (this._inCloseBtn(mx, my)) { this.hide(); return true; }
      if (this._inRepairAllBtn(mx, my)) { this._handleRepairAll(); return true; }
      const rowIdx = this._getRowBtnAt(mx, my);
      if (rowIdx >= 0) {
        this._handleRepairRow(rowIdx);
        consumed = true;
      } else {
        consumed = true; // 点在窗口内但非按钮，消费避免穿透
      }
    }
    return consumed;
  }

  _handleRepairRow(index) {
    const rows = this._getRows();
    if (index < 0 || index >= rows.length) return;
    const row = rows[index];
    if (!row.needRepair) { this._setMessage(`${row.name} 无需修理`); return; }
    if (this.player.gold < row.cost) { this._setMessage('金币不足，无法修理'); return; }
    // repairItem 会将耐久回满并返回费用（不扣金币，此处手动扣）
    const cost = repairItem(row.item);
    this.player.gold -= cost;
    this._setMessage(`修理 ${row.name}，花费 ${cost} 金币`);
  }

  _handleRepairAll() {
    const res = repairAll(this.player);
    if (res.ok) {
      this._setMessage(res.cost > 0 ? `全部修理完成，花费 ${res.cost} 金币` : '装备均无需修理');
    } else {
      this._setMessage('金币不足，共需 ' + res.cost + ' 金币');
    }
  }

  _setMessage(text) { this.message = text; this.messageTimer = 2.0; }

  /** 绘制 */
  render(ctx) {
    if (!this.visible) return;
    this._clampScroll();

    ctx.save();
    // 背景
    ctx.fillStyle = 'rgba(20, 18, 26, 0.94)';
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 2;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeRect(this.x, this.y, this.w, this.h);

    // 标题
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(this.x, this.y, this.w, TITLE_H);
    ctx.fillStyle = '#e8d8a8';
    ctx.font = 'bold 14px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('铁匠铺 · 装备修理', this.x + PAD, this.y + TITLE_H / 2);
    this._drawCloseButton(ctx);

    this._drawList(ctx);
    this._drawBottom(ctx);
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

  _drawList(ctx) {
    const rows = this._getRows();
    const visN = this._visibleRowCount();
    const iconSize = 28;
    const btnW = 50, btnH = 26;

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.x + PAD, this.listY, this.w - PAD * 2, this.listH);
    ctx.clip();

    for (let i = 0; i < visN; i++) {
      const rowIdx = i + this.scroll;
      if (rowIdx >= rows.length) break;
      const row = rows[rowIdx];
      const ry = this.listY + i * ROW_H;

      // 行背景
      ctx.fillStyle = i % 2 === 0 ? 'rgba(40,36,50,0.5)' : 'rgba(30,26,40,0.5)';
      ctx.fillRect(this.x + PAD, ry, this.w - PAD * 2, ROW_H - 2);

      // 图标
      const ix = this.x + PAD + 4;
      const iy = ry + (ROW_H - iconSize) / 2;
      ctx.fillStyle = row.color;
      ctx.fillRect(ix, iy, iconSize, iconSize);
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(ix + 0.5, iy + 0.5, iconSize - 1, iconSize - 1);

      // 名字
      ctx.fillStyle = '#e8d8a8';
      ctx.font = '13px monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(row.name, ix + iconSize + 8, ry + 12);

      // 耐久条
      const barX = ix + iconSize + 8;
      const barY = ry + 22;
      const barW = this.w - PAD * 2 - (barX - this.x) - btnW - 6;
      const barH = 8;
      const ratio = row.max > 0 ? Math.max(0, Math.min(1, row.cur / row.max)) : 0;
      ctx.fillStyle = '#1a1620';
      ctx.fillRect(barX, barY, barW, barH);
      let barColor = '#3aa832';
      if (ratio <= 0) barColor = '#c83020';
      else if (ratio < 0.25) barColor = '#c83020';
      else if (ratio < 0.5) barColor = '#d8c020';
      ctx.fillStyle = barColor;
      ctx.fillRect(barX, barY, barW * ratio, barH);
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX + 0.5, barY + 0.5, barW - 1, barH - 1);

      // 耐久文字
      ctx.fillStyle = row.needRepair ? '#ffa060' : '#c0c0c0';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`${row.cur}/${row.max}`, barX, ry + ROW_H - 6);

      // 修理费
      ctx.fillStyle = '#ffd060';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(row.needRepair ? `${row.cost}金` : '—', this.x + this.w - PAD - btnW - 6, ry + ROW_H / 2);

      // 修理按钮
      const bx = this.x + this.w - PAD - btnW;
      const by = ry + (ROW_H - btnH) / 2;
      ctx.fillStyle = row.needRepair ? '#3a4a2a' : '#2a2218';
      ctx.fillRect(bx, by, btnW, btnH);
      ctx.strokeStyle = row.needRepair ? '#80e080' : '#4a3a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, btnW - 1, btnH - 1);
      ctx.fillStyle = row.needRepair ? '#e0ffd0' : '#6a5a3a';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('修理', bx + btnW / 2, by + btnH / 2);
    }

    if (rows.length === 0) {
      ctx.fillStyle = '#6a5a3a';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('未穿戴任何装备', this.x + this.w / 2, this.listY + this.listH / 2);
    }
    ctx.restore();

    // 滚动条
    if (rows.length > visN) {
      const barX = this.x + this.w - PAD - 3;
      const barH = this.listH;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(barX, this.listY, 3, barH);
      const thumbH = Math.max(16, (visN / rows.length) * barH);
      const maxScroll = rows.length - visN;
      const thumbY = this.listY + (maxScroll > 0 ? (this.scroll / maxScroll) * (barH - thumbH) : 0);
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(barX, thumbY, 3, thumbH);
    }
  }

  _drawBottom(ctx) {
    const total = this._totalCost();
    const gold = (this.player && this.player.gold) || 0;

    // 总修理费 / 金币
    ctx.fillStyle = '#a89878';
    ctx.font = '12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('总修理费:', this.x + PAD, this.bottomY + 12);
    ctx.fillStyle = '#ffd060';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${total} 金币`, this.x + PAD + 60, this.bottomY + 12);

    ctx.fillStyle = '#a89878';
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('持有金币:', this.x + this.w - PAD - 60, this.bottomY + 12);
    ctx.fillStyle = '#ffd060';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`${gold}`, this.x + this.w - PAD, this.bottomY + 12);

    // 全部修理按钮
    const b = this.repairAllBtn;
    const canRepair = total > 0 && gold >= total;
    ctx.fillStyle = canRepair ? '#5a3a1a' : '#2a2218';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = canRepair ? '#ffd060' : '#4a3a2a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    ctx.fillStyle = canRepair ? '#ffe060' : '#6a5a3a';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('全部修理', b.x + b.w / 2, b.y + b.h / 2);

    // 反馈消息
    if (this.message) {
      ctx.fillStyle = '#ffe060';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.message, this.x + this.w / 2, this.bottomY + 60);
    }
  }
}

export default RepairWindow;
