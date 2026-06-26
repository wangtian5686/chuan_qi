/**
 * SkillWindow.js — 技能面板 UI（V 键切换）
 *
 * 职责：
 * - 上半区列出"已学技能"：图标占位色（按 type 着色） + 名字 + 等级 + 类型 + 消耗 + 冷却 + 描述
 * - 下半区列出"可学习技能"：图标 + 名字 + 需求等级 + 学习费用 + [学习]按钮
 *   - [学习]按钮：等级与金币双校验通过才可点击
 *   - 点击成功 → 调用 player.learnSkill(skillId) 并扣除 entry.cost 金币
 * - 鼠标悬停技能行显示完整 tooltip
 * - 列表支持滚轮滚动
 * - 已学技能行右侧附 F1-F8 绑定按钮：点击绑定该技能到对应快捷栏槽位，
 *   已绑定槽位高亮；再次点击已绑定的 F 按钮则解绑（player.hotbar[i] = null）
 *
 * 复用：
 * - skills.js 的 getSkill / SKILLS
 * - classes.js 的 getClass（取职业 learnableSkills 列表）
 * - Player.learnSkill(skillId) 返回 boolean（内部已做职业 / 等级校验，金币由本窗口扣）
 *
 * Player 接口约定：
 *   - player.skills : Map<skillId, skillLevel>
 *   - player.classId / player.level / player.gold
 *   - player.learnSkill(skillId) : boolean
 *
 * 交互约定：update() 返回 true 表示本次点击被窗口消费。
 */

import { getSkill } from '../data/skills.js';
import { getClass } from '../data/classes.js';

const TITLE_H = 24;
const PAD = 8;
const CLOSE_SIZE = 18;
/** 已学 / 可学 区块标题高度 */
const SECTION_H = 22;
/** 每行高度 */
const ROW_H = 30;
/** 学习按钮宽度 */
const LEARN_BTN_W = 50;
const LEARN_BTN_H = 22;

/** F1-F8 绑定按钮（已学技能行右侧，点击绑定/解绑到对应快捷栏槽位） */
const FBTN_COUNT = 8;
const FBTN_W = 22;
const FBTN_H = 18;
const FBTN_GAP = 2;
const FBTN_LABELS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

/** 技能占位色（按 type，与 SkillBar 一致） */
const SKILL_COLORS = {
  melee: '#c8902a',
  projectile: '#c04030',
  aoe: '#a040c0',
  buff: '#40b060',
  debuff: '#a04060',
  summon: '#60a0c0',
  teleport: '#60c0c0',
};

/** 技能类型转中文标签 */
function typeLabel(type) {
  const map = {
    melee: '近战', projectile: '投射', aoe: '范围',
    buff: '增益', debuff: '减益', summon: '召唤', teleport: '传送',
  };
  return map[type] || type || '';
}

export class SkillWindow {
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
    this.x = 360;
    this.y = 80;
    this.w = 400;
    this.h = 500;

    /** 列表滚动偏移（行数） */
    this.scroll = 0;
    /** 反馈消息 */
    this.message = '';
    this.messageTimer = 0;

    /** 悬停行索引（-1 无），全局行号（已学 + 可学合并） */
    this.hoverRow = -1;
    /** 悬停行对应技能 id（供 tooltip） */
    this.hoverSkillId = null;

    this._layout();
  }

  _layout() {
    this.closeX = this.x + this.w - CLOSE_SIZE - PAD;
    this.closeY = this.y + (TITLE_H - CLOSE_SIZE) / 2;
    /** 列表区起点 */
    this.listY = this.y + TITLE_H + PAD;
    this.listH = this.h - TITLE_H - PAD * 2;
    /** 反馈消息位置 */
    this.msgY = this.y + this.h - PAD - 16;
  }

  show() { this.visible = true; }
  hide() {
    this.visible = false;
    this.message = '';
    this.messageTimer = 0;
    this.hoverRow = -1;
    this.hoverSkillId = null;
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

  /** 取已学技能行（按 player.skills 顺序） */
  _getLearnedRows() {
    const out = [];
    const skills = this.player && this.player.skills;
    if (!skills) return out;
    for (const [skillId, skillLevel] of skills) {
      const skill = getSkill(skillId);
      if (!skill) continue;
      out.push({
        kind: 'learned',
        skillId,
        skill,
        level: skillLevel,
        name: skill.name,
        type: skill.type,
        color: SKILL_COLORS[skill.type] || '#888888',
      });
    }
    return out;
  }

  /** 取可学习技能行（职业 learnableSkills 中尚未学习的） */
  _getLearnableRows() {
    const out = [];
    if (!this.player) return out;
    const cls = getClass(this.player.classId);
    if (!cls || !cls.learnableSkills) return out;
    const learned = this.player.skills;
    for (const entry of cls.learnableSkills) {
      if (learned && learned.has(entry.skillId)) continue;
      const skill = getSkill(entry.skillId);
      if (!skill) continue;
      const levelOk = this.player.level >= entry.level;
      const goldOk = this.player.gold >= entry.cost;
      out.push({
        kind: 'learnable',
        skillId: entry.skillId,
        skill,
        name: skill.name,
        type: skill.type,
        color: SKILL_COLORS[skill.type] || '#888888',
        requireLevel: entry.level,
        cost: entry.cost,
        levelOk,
        goldOk,
        canLearn: levelOk && goldOk,
      });
    }
    return out;
  }

  /** 合并行（已学在前，可学在后） */
  _getAllRows() {
    return this._getLearnedRows().concat(this._getLearnableRows());
  }

  /** 已学区块行数（含区块标题） */
  _learnedBlockRows() {
    const n = this._getLearnedRows().length;
    return (n > 0 ? 1 : 0) + n; // 标题 + n 行
  }

  /** 可学区块行数（含区块标题；至少 1 行标题） */
  _learnableBlockRows() {
    const n = this._getLearnableRows().length;
    return 1 + n;
  }

  _totalRows() {
    return this._learnedBlockRows() + this._learnableBlockRows();
  }

  _visibleRowCount() {
    return Math.max(0, Math.floor(this.listH / ROW_H));
  }

  _clampScroll() {
    const maxScroll = Math.max(0, this._totalRows() - this._visibleRowCount());
    if (this.scroll < 0) this.scroll = 0;
    if (this.scroll > maxScroll) this.scroll = maxScroll;
  }

  /**
   * 根据鼠标 y 取得列表行（全局行号，含滚动偏移），-1 表示不在行上
   */
  _getRowAt(mx, my) {
    if (mx < this.x + PAD || mx > this.x + this.w - PAD) return -1;
    if (my < this.listY || my > this.listY + this.listH) return -1;
    return Math.floor((my - this.listY) / ROW_H) + this.scroll;
  }

  /** 取得某全局行号对应的行数据（已学/可学区块标题返回 {kind:'section',title}） */
  _getRowData(globalIdx) {
    if (globalIdx < 0) return null;
    const learnedBlock = this._learnedBlockRows();
    // 已学区块
    if (globalIdx < learnedBlock) {
      const learned = this._getLearnedRows();
      if (learned.length === 0) return null;
      if (globalIdx === 0) return { kind: 'section', title: `已学技能 (${learned.length})` };
      return learned[globalIdx - 1];
    }
    // 可学区块
    const localIdx = globalIdx - learnedBlock;
    const learnable = this._getLearnableRows();
    if (localIdx === 0) return { kind: 'section', title: `可学习技能 (${learnable.length})` };
    const row = learnable[localIdx - 1];
    return row || null;
  }

  /** 可学行的"学习"按钮矩形（屏幕坐标） */
  _learnBtnRect(globalIdx) {
    const ry = this.listY + (globalIdx - this.scroll) * ROW_H;
    const bx = this.x + this.w - PAD - LEARN_BTN_W - 4;
    const by = ry + (ROW_H - LEARN_BTN_H) / 2;
    return { x: bx, y: by, w: LEARN_BTN_W, h: LEARN_BTN_H };
  }

  _inLearnBtn(mx, my, globalIdx) {
    const r = this._learnBtnRect(globalIdx);
    return mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h;
  }

  /**
   * 已学技能行右侧第 btnIdx 个 F1-F8 绑定按钮的屏幕矩形
   * 8 个按钮整体右对齐到列表右边缘
   */
  _fBtnRect(globalIdx, btnIdx) {
    const ry = this.listY + (globalIdx - this.scroll) * ROW_H;
    const totalW = FBTN_COUNT * FBTN_W + (FBTN_COUNT - 1) * FBTN_GAP;
    const rightEdge = this.x + this.w - PAD - 4;
    const startX = rightEdge - totalW;
    const bx = startX + btnIdx * (FBTN_W + FBTN_GAP);
    const by = ry + (ROW_H - FBTN_H) / 2;
    return { x: bx, y: by, w: FBTN_W, h: FBTN_H };
  }

  /** 命中检测：返回点中的 F 按钮索引（0-7），-1 表示未点中 */
  _getFBtnAt(mx, my, globalIdx) {
    for (let i = 0; i < FBTN_COUNT; i++) {
      const r = this._fBtnRect(globalIdx, i);
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 切换技能与快捷栏槽位的绑定
   * - 当前已绑定该技能 → 解绑（置 null）
   * - 未绑定或绑定了别的技能 → 绑定（覆盖原绑定）
   * @param {string} skillId 技能 ID
   * @param {number} slotIdx 槽位索引（0-7）
   */
  _toggleBind(skillId, slotIdx) {
    if (!this.player) return;
    if (!this.player.hotbar) this.player.hotbar = new Array(8).fill(null);
    if (this.player.hotbar[slotIdx] === skillId) {
      this.player.hotbar[slotIdx] = null;
      this._setMessage(`${FBTN_LABELS[slotIdx]} 已解绑`);
    } else {
      this.player.hotbar[slotIdx] = skillId;
      const skill = getSkill(skillId);
      this._setMessage(`${skill ? skill.name : skillId} 已绑定到 ${FBTN_LABELS[slotIdx]}`);
    }
  }

  _setMessage(text) { this.message = text; this.messageTimer = 2.5; }

  /**
   * 每帧更新交互
   * @param {number} dt 秒
   * @param {object} input Input 实例
   * @returns {boolean} 是否消费了本帧鼠标点击
   */
  update(dt, input) {
    if (!this.visible) return false;
    const inp = input || this.input;

    // 反馈消息计时
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      if (this.messageTimer <= 0) this.message = '';
    }

    const mouse = inp.getMouse();
    const mx = mouse.x;
    const my = mouse.y;
    const inWindow = this._isInWindow(mx, my);

    // 悬停行 + tooltip skillId
    this.hoverRow = inWindow ? this._getRowAt(mx, my) : -1;
    if (this.hoverRow >= 0) {
      const rd = this._getRowData(this.hoverRow);
      this.hoverSkillId = (rd && rd.skillId) || null;
    } else {
      this.hoverSkillId = null;
    }

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
      const rowIdx = this._getRowAt(mx, my);
      if (rowIdx >= 0) {
        const rd = this._getRowData(rowIdx);
        // 点击可学行的"学习"按钮
        if (rd && rd.kind === 'learnable' && this._inLearnBtn(mx, my, rowIdx)) {
          this._tryLearn(rd);
        }
        // 点击已学行的 F1-F8 绑定按钮：切换绑定/解绑
        else if (rd && rd.kind === 'learned') {
          const btnIdx = this._getFBtnAt(mx, my, rowIdx);
          if (btnIdx >= 0) this._toggleBind(rd.skillId, btnIdx);
        }
        consumed = true;
      } else {
        consumed = true; // 点在窗口空白也消费
      }
    }

    return consumed;
  }

  /** 尝试学习技能：校验等级 + 金币 → learnSkill → 扣金币 */
  _tryLearn(row) {
    if (!row || row.kind !== 'learnable') return;
    if (!row.canLearn) {
      if (!row.levelOk) this._setMessage(`需要等级 ${row.requireLevel}`);
      else if (!row.goldOk) this._setMessage(`金币不足，需要 ${row.cost}`);
      return;
    }
    const ok = typeof this.player.learnSkill === 'function'
      ? this.player.learnSkill(row.skillId)
      : false;
    if (ok) {
      this.player.gold -= row.cost;
      if (this.player.gold < 0) this.player.gold = 0;
      this._setMessage(`学习了 ${row.name}，花费 ${row.cost} 金币`);
    } else {
      this._setMessage(`学习 ${row.name} 失败`);
    }
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
    ctx.fillText('技能', this.x + PAD, this.y + TITLE_H / 2);

    this._drawCloseButton(ctx);
    this._drawList(ctx);

    // 反馈消息
    if (this.message) {
      ctx.fillStyle = '#ffe060';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.message, this.x + this.w / 2, this.msgY);
    }
    ctx.restore();

    // tooltip（独立绘制在窗口之上）
    if (this.hoverSkillId) {
      this._drawTooltip(ctx, this.hoverSkillId);
    }
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
    const total = this._totalRows();
    const visN = this._visibleRowCount();

    ctx.save();
    // 裁剪列表区
    ctx.beginPath();
    ctx.rect(this.x + PAD, this.listY, this.w - PAD * 2, this.listH);
    ctx.clip();

    for (let i = 0; i < visN; i++) {
      const globalIdx = i + this.scroll;
      if (globalIdx >= total) break;
      const rd = this._getRowData(globalIdx);
      if (!rd) continue;
      const ry = this.listY + i * ROW_H;

      if (rd.kind === 'section') {
        this._drawSection(ctx, ry, rd.title);
      } else if (rd.kind === 'learned') {
        this._drawLearnedRow(ctx, ry, rd, globalIdx);
      } else if (rd.kind === 'learnable') {
        this._drawLearnableRow(ctx, ry, rd, globalIdx);
      }
    }

    ctx.restore();

    // 滚动条
    if (total > visN) {
      const barX = this.x + this.w - PAD - 3;
      const barH = this.listH;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(barX, this.listY, 3, barH);
      const thumbH = Math.max(16, (visN / total) * barH);
      const maxScroll = total - visN;
      const thumbY = this.listY + (maxScroll > 0 ? (this.scroll / maxScroll) * (barH - thumbH) : 0);
      ctx.fillStyle = '#6a5a3a';
      ctx.fillRect(barX, thumbY, 3, thumbH);
    }
  }

  /** 区块标题行 */
  _drawSection(ctx, ry, title) {
    ctx.fillStyle = 'rgba(58, 42, 26, 0.7)';
    ctx.fillRect(this.x + PAD, ry, this.w - PAD * 2, ROW_H - 2);
    ctx.fillStyle = '#ffd060';
    ctx.font = 'bold 13px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(title, this.x + PAD + 6, ry + ROW_H / 2);
  }

  /** 已学技能行（右侧附 F1-F8 绑定按钮） */
  _drawLearnedRow(ctx, ry, row, globalIdx) {
    const iconSize = 22;
    const ix = this.x + PAD + 4;
    const iy = ry + (ROW_H - iconSize) / 2;

    // 行底色
    ctx.fillStyle = 'rgba(30, 26, 40, 0.5)';
    ctx.fillRect(this.x + PAD, ry, this.w - PAD * 2, ROW_H - 2);

    // 图标
    ctx.fillStyle = row.color;
    ctx.fillRect(ix, iy, iconSize, iconSize);
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(ix + 0.5, iy + 0.5, iconSize - 1, iconSize - 1);

    // 名字 + 等级（左侧，腾出右侧给 F1-F8 绑定按钮）
    ctx.fillStyle = '#e8d8a8';
    ctx.font = '13px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const nameX = ix + iconSize + 6;
    const nameY = ry + ROW_H / 2;
    ctx.fillText(row.name, nameX, nameY);
    const nameW = ctx.measureText(row.name).width;
    ctx.fillStyle = '#80e080';
    ctx.fillText(`Lv.${row.level}`, nameX + nameW + 8, nameY);

    // 右侧 F1-F8 绑定按钮
    this._drawFBtns(ctx, row, globalIdx);

    // 悬停高亮
    if (globalIdx === this.hoverRow) {
      ctx.strokeStyle = '#a8c8ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x + PAD + 0.5, ry + 0.5, this.w - PAD * 2 - 1, ROW_H - 3);
    }
  }

  /** 绘制已学技能行的 8 个 F1-F8 绑定按钮，已绑定槽位高亮 */
  _drawFBtns(ctx, row, globalIdx) {
    const hotbar = this.player && this.player.hotbar;
    for (let i = 0; i < FBTN_COUNT; i++) {
      const r = this._fBtnRect(globalIdx, i);
      const bound = hotbar && hotbar[i] === row.skillId;
      // 背景：已绑定高亮黄色，未绑定深色
      ctx.fillStyle = bound ? '#ffd060' : '#2a2218';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = bound ? '#ffe060' : '#4a3a2a';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      // 标签
      ctx.fillStyle = bound ? '#1a1208' : '#e8d8a8';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(FBTN_LABELS[i], r.x + r.w / 2, r.y + r.h / 2);
    }
  }

  /** 可学技能行（含"学习"按钮） */
  _drawLearnableRow(ctx, ry, row, globalIdx) {
    const iconSize = 22;
    const ix = this.x + PAD + 4;
    const iy = ry + (ROW_H - iconSize) / 2;

    // 行底色
    ctx.fillStyle = 'rgba(30, 26, 40, 0.5)';
    ctx.fillRect(this.x + PAD, ry, this.w - PAD * 2, ROW_H - 2);

    // 图标（不可学时置灰）
    if (!row.canLearn) ctx.globalAlpha = 0.55;
    ctx.fillStyle = row.color;
    ctx.fillRect(ix, iy, iconSize, iconSize);
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(ix + 0.5, iy + 0.5, iconSize - 1, iconSize - 1);
    ctx.globalAlpha = 1;

    // 名字
    ctx.fillStyle = row.canLearn ? '#e8d8a8' : '#a89878';
    ctx.font = '13px monospace';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(row.name, ix + iconSize + 6, ry + ROW_H / 2);

    // 需求等级 + 费用（中间偏右）
    ctx.textAlign = 'right';
    ctx.fillStyle = row.levelOk ? '#80e080' : '#ff8060';
    ctx.fillText(`Lv.${row.requireLevel}`, this.x + this.w - PAD - LEARN_BTN_W - 60, ry + ROW_H / 2);
    ctx.fillStyle = row.goldOk ? '#ffd060' : '#ff8060';
    ctx.fillText(`${row.cost}金`, this.x + this.w - PAD - LEARN_BTN_W - 8, ry + ROW_H / 2);

    // 学习按钮
    const btn = this._learnBtnRect(globalIdx);
    ctx.fillStyle = row.canLearn ? '#5a3a1a' : '#2a2218';
    ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
    ctx.strokeStyle = row.canLearn ? '#ffd060' : '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(btn.x + 0.5, btn.y + 0.5, btn.w - 1, btn.h - 1);
    ctx.fillStyle = row.canLearn ? '#ffe060' : '#6a5a3a';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('学习', btn.x + btn.w / 2, btn.y + btn.h / 2);

    // 悬停高亮
    if (globalIdx === this.hoverRow) {
      ctx.strokeStyle = '#a8c8ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(this.x + PAD + 0.5, ry + 0.5, this.w - PAD * 2 - 1, ROW_H - 3);
    }
  }

  /** 绘制技能 tooltip（完整属性） */
  _drawTooltip(ctx, skillId) {
    const skill = getSkill(skillId);
    if (!skill) return;
    const mouse = this.input.getMouse();

    const lines = [
      { text: skill.name, color: '#ffe060', bold: true },
      { text: `类型 ${typeLabel(skill.type)}`, color: '#a8c8ff' },
    ];
    // 已学等级
    if (this.player && this.player.skills && this.player.skills.has(skillId)) {
      lines.push({ text: `等级 ${this.player.skills.get(skillId)}`, color: '#80e080' });
    }
    if (skill.mpCost) lines.push({ text: `魔法消耗 ${skill.mpCost}`, color: '#80a0ff' });
    if (skill.cooldown) lines.push({ text: `冷却 ${skill.cooldown}秒`, color: '#c0c0c0' });
    if (skill.range) lines.push({ text: `射程 ${skill.range}格`, color: '#c0c0c0' });
    if (skill.damage) {
      const d = skill.damage;
      const parts = [];
      if (d.base) parts.push(`基础 ${d.base}`);
      if (d.perLevel) parts.push(`每级 +${d.perLevel}`);
      if (d.coefficient) parts.push(`系数 ${d.coefficient}`);
      lines.push({ text: `伤害 ${parts.join(' / ')}`, color: '#ff8060' });
    }
    if (skill.damageType) {
      lines.push({ text: `伤害类型 ${skill.damageType === 'magic' ? '魔法' : '物理'}`, color: '#c080ff' });
    }
    if (skill.description) lines.push({ text: skill.description, color: '#a89878' });

    ctx.save();
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    let maxW = 0;
    for (const l of lines) {
      const w = ctx.measureText(l.text).width;
      if (w > maxW) maxW = w;
    }
    const padX = 8, padY = 6, lineH = 15;
    const boxW = Math.ceil(maxW) + padX * 2;
    const boxH = lines.length * lineH + padY * 2;

    const cw = this.canvas ? (this.canvas.clientWidth || this.canvas.width) : 9999;
    const ch = this.canvas ? (this.canvas.clientHeight || this.canvas.height) : 9999;
    let bx = mouse.x + 14;
    let by = mouse.y + 14;
    if (bx + boxW > cw) bx = mouse.x - boxW - 14;
    if (by + boxH > ch) by = mouse.y - boxH - 14;
    bx = Math.max(2, bx);
    by = Math.max(2, by);

    ctx.fillStyle = 'rgba(10, 8, 14, 0.96)';
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 1;
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);

    let ty = by + padY;
    for (const l of lines) {
      ctx.fillStyle = l.color || '#e8d8a8';
      ctx.font = l.bold ? 'bold 12px monospace' : '12px monospace';
      ctx.fillText(l.text, bx + padX, ty);
      ty += lineH;
    }
    ctx.restore();
  }
}

export default SkillWindow;
