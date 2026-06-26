/**
 * TeleportDialog.js — 传送员对话 UI
 *
 * 职责：
 * - 展示传送员对话文本与可选目的地列表（含价格）
 * - 点击目的地：校验金币 → 扣费 → 触发 game.teleportTo(targetMap, targetX, targetY)
 * - 右上角关闭按钮
 *
 * game 引用通过 this.game 属性注入（由 main.js 在打开窗口时赋值）。
 */

const TITLE_H = 24;
const PAD = 10;
const ROW_H = 30;
const CLOSE_SIZE = 18;
const DIALOG_H = 48;
const BOTTOM_PAD = 22;

export class TeleportDialog {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} player Player 实例
   * @param {object} npc Npc 实例
   * @param {Array<{label:string, targetMap:string, targetX:number, targetY:number, cost:number}>} availableDestinations
   */
  constructor(canvas, input, player, npc, availableDestinations) {
    this.canvas = canvas;
    this.input = input;
    this.player = player;
    this.npc = npc;
    this.destinations = Array.isArray(availableDestinations) ? availableDestinations.slice() : [];

    this.visible = false;
    this.x = 320;
    this.y = 100;
    this.w = 320;
    /** 高度按目的地数量自适应 */
    this.h = TITLE_H + PAD + DIALOG_H + PAD +
      Math.max(1, this.destinations.length) * ROW_H + BOTTOM_PAD;

    /** game 引用（main.js 注入，用于调用 teleportTo） */
    this.game = null;

    this.message = '';
    this.messageTimer = 0;

    this._layout();
  }

  _layout() {
    this.dialogY = this.y + TITLE_H + PAD;
    this.listY = this.dialogY + DIALOG_H + PAD;
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

  _inCloseBtn(mx, my) {
    return mx >= this.closeX && mx <= this.closeX + CLOSE_SIZE &&
      my >= this.closeY && my <= this.closeY + CLOSE_SIZE;
  }

  _getRowAt(mx, my) {
    if (mx < this.x + PAD || mx > this.x + this.w - PAD) return -1;
    if (my < this.listY) return -1;
    const idx = Math.floor((my - this.listY) / ROW_H);
    if (idx < 0 || idx >= this.destinations.length) return -1;
    // 排除行间隙
    const ry = this.listY + idx * ROW_H;
    if (my > ry + ROW_H - 2) return -1;
    return idx;
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
    if (mouse.leftPressed && inWindow) {
      if (this._inCloseBtn(mx, my)) { this.hide(); return true; }
      const idx = this._getRowAt(mx, my);
      if (idx >= 0) {
        this._handleSelect(idx);
        consumed = true;
      } else {
        consumed = true;
      }
    }
    return consumed;
  }

  _handleSelect(idx) {
    const dest = this.destinations[idx];
    if (!dest) return;
    const gold = (this.player && this.player.gold) || 0;
    const cost = dest.cost || 0;
    if (gold < cost) {
      this._setMessage('金币不足，需要 ' + cost + ' 金币');
      return;
    }
    // 扣费
    if (this.player) this.player.gold -= cost;
    // 触发传送
    if (this.game && typeof this.game.teleportTo === 'function') {
      this.game.teleportTo(dest.targetMap, dest.targetX, dest.targetY);
    }
    // 传送后关闭对话框
    this.hide();
  }

  _setMessage(text) { this.message = text; this.messageTimer = 2.0; }

  /** 绘制 */
  render(ctx) {
    if (!this.visible) return;
    ctx.save();
    // 背景
    ctx.fillStyle = 'rgba(20, 18, 26, 0.95)';
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
    const titleName = (this.npc && this.npc.name) || '传送员';
    ctx.fillText(titleName, this.x + PAD, this.y + TITLE_H / 2);
    this._drawCloseButton(ctx);

    // 对话文本
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(this.x + PAD, this.dialogY, this.w - PAD * 2, DIALOG_H);
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x + PAD + 0.5, this.dialogY + 0.5, this.w - PAD * 2 - 1, DIALOG_H - 1);
    ctx.fillStyle = '#e8d8a8';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('要去哪里？', this.x + PAD + 8, this.dialogY + DIALOG_H / 2);

    // 目的地列表
    const gold = (this.player && this.player.gold) || 0;
    for (let i = 0; i < this.destinations.length; i++) {
      const dest = this.destinations[i];
      const ry = this.listY + i * ROW_H;
      const affordable = gold >= (dest.cost || 0);

      ctx.fillStyle = i % 2 === 0 ? 'rgba(40,36,50,0.6)' : 'rgba(30,26,40,0.6)';
      ctx.fillRect(this.x + PAD, ry, this.w - PAD * 2, ROW_H - 2);
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(this.x + PAD + 0.5, ry + 0.5, this.w - PAD * 2 - 1, ROW_H - 3);

      ctx.fillStyle = affordable ? '#e8d8a8' : '#7a6a5a';
      ctx.font = '13px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(dest.label, this.x + PAD + 10, ry + ROW_H / 2);

      ctx.textAlign = 'right';
      ctx.fillStyle = affordable ? '#ffd060' : '#c83020';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`${dest.cost || 0}金`, this.x + this.w - PAD - 8, ry + ROW_H / 2);
    }

    // 空列表提示
    if (this.destinations.length === 0) {
      ctx.fillStyle = '#6a5a3a';
      ctx.font = '13px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('暂无可达目的地', this.x + this.w / 2, this.listY + ROW_H / 2);
    }

    // 反馈消息
    if (this.message) {
      ctx.fillStyle = '#ffe060';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.message, this.x + this.w / 2, this.y + this.h - 12);
    }
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
}

export default TeleportDialog;
