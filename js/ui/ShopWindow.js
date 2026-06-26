/**
 * ShopWindow.js — 商店窗口 UI
 *
 * 职责：
 * - Buy 标签：展示 NPC 售卖列表（图标占位色块 + 名字 + 买价 + 数量），点击购买 1 件
 * - Sell 标签：展示玩家背包可卖物品（卖价 = floor(price/2)），点击出售 1 件
 * - 显示玩家金币；右上角关闭按钮；列表支持滚轮滚动
 *
 * 交互约定（与 InventoryWindow/EquipmentWindow 一致）：
 * - 鼠标坐标取自 input.getMouse()（canvas 内 CSS 像素）
 * - update() 返回 true 表示本次点击被窗口消费，调用方据此跳过世界点击处理
 *
 * 复用：
 * - ItemOps.buyItem / sellItem 完成实际买卖与金币 / 背包校验
 * - items.js 的 getItem 取物品名 / 占位色 / 价格
 */

import { getItem } from '../data/items.js';
import { buyItem, sellItem } from '../game/ItemOps.js';

const TITLE_H = 24;
const TAB_H = 26;
const PAD = 8;
const ROW_H = 30;
const CLOSE_SIZE = 18;
const MSG_H = 18;
const GOLD_H = 26;

export class ShopWindow {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} player Player 实例
   * @param {object} npc Npc 实例
   */
  constructor(canvas, input, player, npc) {
    this.canvas = canvas;
    this.input = input;
    this.player = player;
    this.npc = npc;

    this.visible = false;
    this.x = 260;
    this.y = 80;
    this.w = 400;
    this.h = 500;

    /** 当前标签：'buy' | 'sell' */
    this.selectedTab = 'buy';
    /** 列表滚动偏移（行数） */
    this.scroll = 0;
    /** 反馈消息（购买/出售结果，短暂显示） */
    this.message = '';
    this.messageTimer = 0;

    this._layout();
  }

  _layout() {
    this.tabY = this.y + TITLE_H;
    this.listY = this.tabY + TAB_H + PAD;
    this.listH = this.h - TITLE_H - TAB_H - PAD - MSG_H - GOLD_H - PAD;
    this.msgY = this.listY + this.listH;
    this.goldY = this.msgY + MSG_H;
    this.closeX = this.x + this.w - CLOSE_SIZE - PAD;
    this.closeY = this.y + (TITLE_H - CLOSE_SIZE) / 2;
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

  /** Buy 标签的行数据 */
  _getBuyRows() {
    const shop = (this.npc && this.npc.shop) || [];
    const rows = [];
    for (const entry of shop) {
      const def = getItem(entry.itemId);
      if (!def) continue;
      rows.push({
        itemId: entry.itemId,
        name: def.name,
        color: def.color || '#888888',
        price: entry.price != null ? entry.price : (def.price || 0),
        count: entry.count, // undefined = 无限
      });
    }
    return rows;
  }

  /** Sell 标签的行数据（玩家背包可卖物品） */
  _getSellRows() {
    const inv = this.player && this.player.inventory;
    const rows = [];
    if (!inv) return rows;
    for (let i = 0; i < inv.slots.length; i++) {
      const stack = inv.slots[i];
      if (!stack) continue;
      const def = getItem(stack.itemId);
      if (!def || !def.price || def.price <= 0) continue;
      rows.push({
        invSlot: i,
        itemId: stack.itemId,
        name: def.name,
        color: def.color || '#888888',
        sellPrice: Math.floor(def.price / 2),
        count: stack.count,
      });
    }
    return rows;
  }

  _getRows() {
    return this.selectedTab === 'buy' ? this._getBuyRows() : this._getSellRows();
  }

  /** 可见行数 */
  _visibleRowCount() {
    return Math.max(0, Math.floor(this.listH / ROW_H));
  }

  /** 根据鼠标 y 取得列表行索引（含滚动偏移），-1 表示不在行上 */
  _getRowAt(mx, my) {
    if (mx < this.x + PAD || mx > this.x + this.w - PAD) return -1;
    if (my < this.listY || my > this.listY + this.listH) return -1;
    return Math.floor((my - this.listY) / ROW_H) + this.scroll;
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

  _inTab(mx, my, tab) {
    const tabW = 70;
    const gap = 4;
    const tx = tab === 'buy'
      ? this.x + PAD
      : this.x + PAD + tabW + gap;
    return mx >= tx && mx <= tx + tabW && my >= this.tabY && my <= this.tabY + TAB_H;
  }

  /**
   * 每帧更新交互
   * @returns {boolean} 是否消费了本帧鼠标点击
   */
  update(dt, input) {
    if (!this.visible) return false;
    // 反馈消息计时
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = '';
    }

    const inp = input || this.input;
    const mouse = inp.getMouse();
    const mx = mouse.x;
    const my = mouse.y;
    const inWindow = this._isInWindow(mx, my);

    let consumed = false;

    // 滚轮滚动列表（deltaY 正 = 向下滚动，查看后续行）
    if (inWindow && typeof inp.getWheelDelta === 'function') {
      const wheel = inp.getWheelDelta();
      if (wheel > 0) { this.scroll++; consumed = true; }
      else if (wheel < 0) { this.scroll--; consumed = true; }
      this._clampScroll();
    }

    if (mouse.leftPressed && inWindow) {
      if (this._inCloseBtn(mx, my)) { this.hide(); return true; }
      if (this._inTab(mx, my, 'buy')) { this.selectedTab = 'buy'; this.scroll = 0; return true; }
      if (this._inTab(mx, my, 'sell')) { this.selectedTab = 'sell'; this.scroll = 0; return true; }
      const rowIdx = this._getRowAt(mx, my);
      if (rowIdx >= 0) {
        this._handleRowClick(rowIdx);
        consumed = true;
      } else {
        consumed = true; // 点在窗口空白处也消费，避免穿透到世界
      }
    }

    return consumed;
  }

  _handleRowClick(rowIdx) {
    const rows = this._getRows();
    if (rowIdx < 0 || rowIdx >= rows.length) return;
    const row = rows[rowIdx];
    if (this.selectedTab === 'buy') {
      const res = buyItem(this.player, row.itemId, 1);
      if (res.ok) {
        this._setMessage(`购买 ${row.name}，花费 ${row.price} 金币`);
      } else {
        this._setMessage('购买失败：' + this._reasonText(res.reason));
      }
    } else {
      const res = sellItem(this.player, row.invSlot, 1);
      if (res.ok) {
        this._setMessage(`出售 ${row.name}，获得 ${res.gold} 金币`);
      } else {
        this._setMessage('出售失败：' + this._reasonText(res.reason));
      }
    }
  }

  _setMessage(text) { this.message = text; this.messageTimer = 2.0; }

  _reasonText(reason) {
    const map = {
      gold_insufficient: '金币不足',
      inventory_full: '背包已满',
      empty_slot: '空格',
      invalid_item: '物品无效',
      not_sellable: '不可出售',
      no_inventory: '无背包',
      invalid_count: '数量无效',
    };
    return map[reason] || reason || '未知';
  }

  /** 绘制 */
  render(ctx) {
    if (!this.visible) return;
    this._clampScroll();

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
    const titleName = (this.npc && this.npc.name) || '商店';
    ctx.fillText(titleName, this.x + PAD, this.y + TITLE_H / 2);

    this._drawCloseButton(ctx);
    this._drawTabs(ctx);
    this._drawList(ctx);

    // 反馈消息条
    if (this.message) {
      ctx.fillStyle = '#ffe060';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.message, this.x + this.w / 2, this.msgY + MSG_H / 2);
    }

    this._drawGoldBar(ctx);
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

  _drawTabs(ctx) {
    const tabW = 70;
    const gap = 4;
    const tabs = [
      { id: 'buy', label: '购买', x: this.x + PAD },
      { id: 'sell', label: '出售', x: this.x + PAD + tabW + gap },
    ];
    ctx.font = 'bold 13px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const t of tabs) {
      const active = this.selectedTab === t.id;
      ctx.fillStyle = active ? '#6a5a3a' : '#2a2218';
      ctx.fillRect(t.x, this.tabY, tabW, TAB_H);
      ctx.strokeStyle = active ? '#ffd060' : '#4a3a2a';
      ctx.lineWidth = active ? 2 : 1;
      ctx.strokeRect(t.x + 0.5, this.tabY + 0.5, tabW - 1, TAB_H - 1);
      ctx.fillStyle = active ? '#ffe060' : '#a89878';
      ctx.fillText(t.label, t.x + tabW / 2, this.tabY + TAB_H / 2);
    }
  }

  _drawList(ctx) {
    const rows = this._getRows();
    const visN = this._visibleRowCount();
    const iconSize = 24;

    // 裁剪列表区
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

      // 图标占位色块
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
      ctx.fillText(row.name, ix + iconSize + 8, ry + ROW_H / 2);

      // 数量 + 价格（右侧）
      ctx.textAlign = 'right';
      if (this.selectedTab === 'buy') {
        const countTxt = row.count != null ? `×${row.count}` : '∞';
        ctx.fillStyle = '#a89878';
        ctx.font = '12px monospace';
        ctx.fillText(countTxt, this.x + this.w - PAD - 70, ry + ROW_H / 2);
        ctx.fillStyle = '#ffd060';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`${row.price}金`, this.x + this.w - PAD - 6, ry + ROW_H / 2);
      } else {
        ctx.fillStyle = '#a89878';
        ctx.font = '12px monospace';
        ctx.fillText(`×${row.count}`, this.x + this.w - PAD - 70, ry + ROW_H / 2);
        ctx.fillStyle = '#80e080';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(`${row.sellPrice}金`, this.x + this.w - PAD - 6, ry + ROW_H / 2);
      }
    }

    // 空列表提示
    if (rows.length === 0) {
      ctx.fillStyle = '#6a5a3a';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        this.selectedTab === 'buy' ? '暂无商品' : '背包无可卖物品',
        this.x + this.w / 2, this.listY + this.listH / 2
      );
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

  _drawGoldBar(ctx) {
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(this.x + PAD, this.goldY, this.w - PAD * 2, GOLD_H);
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x + PAD + 0.5, this.goldY + 0.5, this.w - PAD * 2 - 1, GOLD_H - 1);
    const gold = (this.player && this.player.gold) || 0;
    ctx.fillStyle = '#ffd060';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`金币: ${gold}`, this.x + PAD + 8, this.goldY + GOLD_H / 2);
  }
}

export default ShopWindow;
