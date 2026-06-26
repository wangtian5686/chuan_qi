/**
 * EquipmentWindow.js — 角色装备面板 UI
 *
 * 职责：
 * - 显示 10 个装备槽（武器/衣服/头盔/项链/左戒/右戒/左手镯/右手镯/腰带/靴子）
 * - 显示角色属性面板（HP/MP/攻防/命中/闪避/幸运/诅咒/移动速度/攻击速度等）
 * - 显示当前激活的套装加成
 * - 右键装备槽卸下装备
 *
 * Player 接口约定：
 *   - player.equipment : Equipment
 *   - player.stats : object  聚合属性（含 hp/mp 视为上限、minAtk/maxAtk 等）
 *   - player.hp / player.mp : number  当前生命 / 魔法
 *   - player.maxHp / player.maxHp : number  上限（缺省回退到 stats.hp/mp）
 *   - player.level / player.classId / player.gold / player.pkValue
 */

import { getItem, checkSetBonus, SET_BONUS } from '../data/items.js';
import { getClass } from '../data/classes.js';
import { unequipItem } from '../game/ItemOps.js';

const TITLE_H = 24;
const PAD = 8;
const DIVIDER = 8;
const SLOT_SIZE = 32;
const LABEL_W = 54;
const ROW_H = 36;
const STATS_W = 200;

/** 装备槽显示顺序与中文标签 */
const EQUIP_LAYOUT = [
  { slot: 'helmet', label: '头盔' },
  { slot: 'necklace', label: '项链' },
  { slot: 'weapon', label: '武器' },
  { slot: 'armor', label: '衣服' },
  { slot: 'ringLeft', label: '左戒' },
  { slot: 'ringRight', label: '右戒' },
  { slot: 'braceletLeft', label: '左手镯' },
  { slot: 'braceletRight', label: '右手镯' },
  { slot: 'belt', label: '腰带' },
  { slot: 'boots', label: '靴子' },
];

export class EquipmentWindow {
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
    this.x = 540;
    this.y = 90;

    /** 悬停的装备槽名（null 表示无） */
    this.hoverSlot = null;

    this._layout();
  }

  _layout() {
    this.equipAreaW = LABEL_W + SLOT_SIZE;
    this.w = PAD + this.equipAreaW + DIVIDER + STATS_W + PAD;
    // 装备区高度
    const equipH = EQUIP_LAYOUT.length * ROW_H;
    this.equipAreaY = this.y + TITLE_H + PAD;
    this.statsX = this.x + PAD + this.equipAreaW + DIVIDER;
    this.statsY = this.y + TITLE_H + PAD;
    // 高度取装备区与属性区较大者，并预留套装加成区域
    this.h = TITLE_H + PAD * 2 + Math.max(equipH, 260);
  }

  toggle() {
    this.visible = !this.visible;
    if (!this.visible) this.hoverSlot = null;
  }

  show() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
    this.hoverSlot = null;
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this._layout();
  }

  _isInWindow(mx, my) {
    return mx >= this.x && mx <= this.x + this.w && my >= this.y && my <= this.y + this.h;
  }

  /** 取得鼠标所在装备槽名（null 表示不在槽上） */
  _getSlotAt(mx, my) {
    for (let i = 0; i < EQUIP_LAYOUT.length; i++) {
      const row = i;
      const sy = this.equipAreaY + row * ROW_H;
      const sx = this.x + PAD + LABEL_W;
      if (mx >= sx && mx <= sx + SLOT_SIZE && my >= sy && my <= sy + SLOT_SIZE) {
        return EQUIP_LAYOUT[i].slot;
      }
    }
    return null;
  }

  /**
   * 每帧更新交互
   * @returns {boolean} 是否消费了本帧鼠标点击
   */
  update(dt, input) {
    if (!this.visible) return false;
    const mouse = input.getMouse();
    const mx = mouse.x;
    const my = mouse.y;
    const inWindow = this._isInWindow(mx, my);

    this.hoverSlot = inWindow ? this._getSlotAt(mx, my) : null;

    let consumed = false;

    // 右键装备槽卸下
    if (mouse.rightPressed && inWindow) {
      const slot = this._getSlotAt(mx, my);
      if (slot) {
        const eq = this.player && this.player.equipment;
        if (eq && eq.getSlot(slot)) {
          unequipItem(this.player, slot);
        }
        consumed = true;
      } else {
        consumed = true;
      }
    }

    // 左键点在窗口内也消费，避免穿透到世界
    if (mouse.leftPressed && inWindow) {
      consumed = true;
    }

    return consumed;
  }

  /** 绘制 */
  render(ctx) {
    if (!this.visible) return;
    const eq = this.player && this.player.equipment;

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
    ctx.fillText('角色装备', this.x + PAD, this.y + TITLE_H / 2);

    // 左侧装备槽
    this._renderEquipSlots(ctx, eq);

    // 分隔线
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.statsX - DIVIDER / 2, this.y + TITLE_H);
    ctx.lineTo(this.statsX - DIVIDER / 2, this.y + this.h - PAD);
    ctx.stroke();

    // 右侧属性面板
    this._renderStats(ctx);

    ctx.restore();
  }

  /** 绘制装备槽列表 */
  _renderEquipSlots(ctx, eq) {
    ctx.font = '12px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    for (let i = 0; i < EQUIP_LAYOUT.length; i++) {
      const { slot, label } = EQUIP_LAYOUT[i];
      const sy = this.equipAreaY + i * ROW_H;
      const sx = this.x + PAD;

      // 标签
      ctx.fillStyle = '#a89878';
      ctx.fillText(label, sx, sy + SLOT_SIZE / 2);

      // 槽位框
      const boxX = sx + LABEL_W;
      const boxY = sy;
      ctx.fillStyle = '#1a1620';
      ctx.fillRect(boxX, boxY, SLOT_SIZE, SLOT_SIZE);
      ctx.strokeStyle = '#4a3a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(boxX + 0.5, boxY + 0.5, SLOT_SIZE - 1, SLOT_SIZE - 1);

      const equipped = eq ? eq.getSlot(slot) : null;
      if (equipped) {
        const def = getItem(equipped.itemId);
        const color = (def && def.color) || '#888888';
        // 损坏置灰
        if (def && def.maxDurability && equipped.durability != null && equipped.durability <= 0) {
          ctx.globalAlpha = 0.4;
        }
        ctx.fillStyle = color;
        ctx.fillRect(boxX + 3, boxY + 3, SLOT_SIZE - 6, SLOT_SIZE - 6);
        ctx.globalAlpha = 1;
      }

      // 悬停 / 损坏高亮
      if (this.hoverSlot === slot) {
        ctx.strokeStyle = '#a8c8ff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boxX + 1, boxY + 1, SLOT_SIZE - 2, SLOT_SIZE - 2);
      }
    }
  }

  /** 绘制属性面板 */
  _renderStats(ctx) {
    const p = this.player;
    const stats = (p && p.stats) || {};

    const curHp = this._num(p.hp != null ? p.hp : p.currentHp);
    const maxHp = this._num(p.maxHp != null ? p.maxHp : stats.hp);
    const curMp = this._num(p.mp != null ? p.mp : p.currentMp);
    const maxMp = this._num(p.maxMp != null ? p.maxMp : stats.mp);

    const classId = p.classId || p.class || '';
    const cls = getClass(classId);
    const className = cls ? cls.name : classId;

    const lines = [];
    lines.push({ label: '职业', value: className, color: '#e8d8a8' });
    lines.push({ label: '等级', value: String(p.level != null ? p.level : 0), color: '#e8d8a8' });
    lines.push({ label: '生命', value: `${curHp} / ${maxHp}`, color: '#ff8080' });
    lines.push({ label: '魔法', value: `${curMp} / ${maxMp}`, color: '#80a0ff' });
    lines.push({ label: '攻击', value: `${this._num(stats.minAtk)} - ${this._num(stats.maxAtk)}`, color: '#ffe060' });
    lines.push({ label: '魔法攻击', value: `${this._num(stats.minMatk)} - ${this._num(stats.maxMatk)}`, color: '#c080ff' });
    lines.push({ label: '防御', value: String(this._num(stats.def)), color: '#a0c0ff' });
    lines.push({ label: '魔防', value: String(this._num(stats.mdef)), color: '#a0ffc0' });
    lines.push({ label: '命中', value: String(this._num(stats.hit)), color: '#e0e0e0' });
    lines.push({ label: '闪避', value: String(this._num(stats.dodge)), color: '#e0e0e0' });
    lines.push({ label: '幸运', value: String(this._num(stats.lucky)), color: '#80ff80' });
    lines.push({ label: '诅咒', value: String(this._num(stats.curse)), color: '#a06060' });
    lines.push({ label: '攻击距离', value: String(this._num(stats.attackRange)), color: '#c0c0c0' });
    lines.push({ label: '攻击速度', value: String(this._num(stats.attackSpeed)), color: '#c0c0c0' });
    lines.push({ label: '移动速度', value: String(this._num(stats.moveSpeed)), color: '#c0c0c0' });
    lines.push({ label: '金币', value: String(this._num(p.gold)), color: '#ffd060' });
    if (p.pkValue != null) {
      lines.push({ label: 'PK 值', value: String(this._num(p.pkValue)), color: p.pkValue > 0 ? '#ff6060' : '#c0c0c0' });
    }

    const lineH = 17;
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    let y = this.statsY;
    // 属性行
    for (const ln of lines) {
      ctx.fillStyle = '#a89878';
      ctx.fillText(ln.label, this.statsX, y);
      ctx.fillStyle = ln.color;
      ctx.textAlign = 'right';
      ctx.fillText(ln.value, this.statsX + STATS_W - 4, y);
      ctx.textAlign = 'left';
      y += lineH;
    }

    // 套装加成
    y += 4;
    ctx.fillStyle = '#6a5a3a';
    ctx.fillRect(this.statsX, y, STATS_W - 4, 1);
    y += 6;
    ctx.fillStyle = '#e8d8a8';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('套装加成', this.statsX, y);
    y += lineH;

    const eq = p.equipment;
    const activeSets = eq ? checkSetBonus(eq.getEquippedItemIds()) : [];
    ctx.font = '12px monospace';
    if (activeSets.length === 0) {
      ctx.fillStyle = '#6a5a3a';
      ctx.fillText('（未激活）', this.statsX, y);
      y += lineH;
    } else {
      for (const set of activeSets) {
        const def = SET_BONUS[set.setName];
        const name = def ? def.name : set.setName;
        ctx.fillStyle = '#ffd060';
        ctx.fillText(`◆ ${name}`, this.statsX, y);
        y += lineH;
        const bonusLines = this._formatBonus(set.bonus);
        for (const bl of bonusLines) {
          ctx.fillStyle = '#80e080';
          ctx.fillText(`   ${bl}`, this.statsX, y);
          y += lineH;
        }
      }
    }
  }

  /** 套装 bonus 对象格式化为属性行 */
  _formatBonus(bonus) {
    const out = [];
    if (!bonus) return out;
    if (bonus.minAtk || bonus.maxAtk) out.push(`攻击 +${bonus.minAtk || 0}/+${bonus.maxAtk || 0}`);
    if (bonus.minMatk || bonus.maxMatk) out.push(`魔法 +${bonus.minMatk || 0}/+${bonus.maxMatk || 0}`);
    if (bonus.def) out.push(`防御 +${bonus.def}`);
    if (bonus.mdef) out.push(`魔防 +${bonus.mdef}`);
    if (bonus.hp) out.push(`生命 +${bonus.hp}`);
    if (bonus.mp) out.push(`魔法值 +${bonus.mp}`);
    if (bonus.hit) out.push(`命中 +${bonus.hit}`);
    if (bonus.dodge) out.push(`闪避 +${bonus.dodge}`);
    if (bonus.lucky) out.push(`幸运 +${bonus.lucky}`);
    return out;
  }

  /** 安全取数字 */
  _num(v) {
    return typeof v === 'number' ? v : 0;
  }
}

export default EquipmentWindow;
