/**
 * SkillBar.js — 底部技能栏 F1-F8
 *
 * 职责：
 * - 屏幕底部居中绘制 8 个技能槽（44×44，间隔 4）
 * - F1-F8 触发对应槽技能：player.castSkill(skillId, mouseWorldX, mouseWorldY)
 *   目标为鼠标位置对应的世界坐标（取自 input.mouse.worldX/worldY，由 main.js 每帧回写）
 * - 每槽显示：技能占位色块（按 type 着色） + F1-F8 标签 + 冷却覆盖（黑色半透明 + 剩余秒数）
 * - 鼠标悬停显示技能 tooltip（名字 / 类型 / 消耗 / 冷却 / 描述）
 *
 * 交互约定：
 * - player.hotbar: Array(8)，元素为 skillId | null
 * - player.cooldowns: Map<skillId, 剩余毫秒>
 * - player.castSkill(skillId, targetX, targetY) 返回 {ok, reason, skill?}
 * - 鼠标右键拖拽技能到技能栏：暂不实现，预留接口（onSkillDrop(slotIndex, skillId)）
 * - 鼠标右键点击已绑定槽位：清空该槽绑定（player.hotbar[idx] = null）
 */
import { getSkill } from '../data/skills.js';

/** 槽位尺寸 */
const SLOT_SIZE = 44;
/** 槽位间隔 */
const GAP = 4;
/** 槽数 */
const SLOT_COUNT = 8;
/** F1-F8 按键码（与 KeyboardEvent.code 一致） */
const HOTKEYS = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'];

/** 技能占位色（按 type） */
const SKILL_COLORS = {
  melee: '#c8902a',
  projectile: '#c04030',
  aoe: '#a040c0',
  buff: '#40b060',
  debuff: '#a04060',
  summon: '#60a0c0',
  teleport: '#60c0c0',
};

export class SkillBar {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} game Game 单例（提供 camera，用于鼠标屏幕坐标→世界坐标回退）
   */
  constructor(canvas, input, game) {
    this.canvas = canvas;
    this.input = input;
    this.game = game;
    this.slotSize = SLOT_SIZE;
    this.gap = GAP;
    /** 屏幕底部居中坐标（_layout 计算） */
    this.x = 0;
    this.y = 0;
    this.totalW = 0;
    /** 悬停槽索引（-1 无） */
    this.hoverSlot = -1;
    /** tooltip 缓存（供自绘） */
    this.tooltipText = '';
    this.tooltipX = 0;
    this.tooltipY = 0;
    this.showTooltip = false;
    /** 拖拽落点回调（预留）：onSkillDrop(slotIndex, skillId) */
    this.onSkillDrop = null;
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

  /** 计算技能栏左上角坐标（底部居中） */
  _layout() {
    const { w: vw, h: vh } = this._cssSize();
    this.totalW = SLOT_COUNT * SLOT_SIZE + (SLOT_COUNT - 1) * GAP;
    this.x = Math.floor((vw - this.totalW) / 2);
    this.y = vh - SLOT_SIZE - 8;
  }

  /** 取鼠标所在槽索引（-1 无） */
  _getSlotAt(mx, my) {
    for (let i = 0; i < SLOT_COUNT; i++) {
      const sx = this.x + i * (SLOT_SIZE + GAP);
      const sy = this.y;
      if (mx >= sx && mx <= sx + SLOT_SIZE && my >= sy && my <= sy + SLOT_SIZE) {
        return i;
      }
    }
    return -1;
  }

  /** 取鼠标世界坐标（优先 input.mouse.worldX/worldY，回退相机换算） */
  _mouseWorld() {
    const m = this.input.getMouse();
    if (m.worldX != null || m.worldY != null) {
      return { x: m.worldX, y: m.worldY };
    }
    if (this.game && this.game.camera) {
      return this.game.camera.screenToWorld(m.x, m.y);
    }
    return { x: 0, y: 0 };
  }

  /** 技能类型转中文标签 */
  _typeLabel(type) {
    const map = {
      melee: '近战', projectile: '投射', aoe: '范围',
      buff: '增益', debuff: '减益', summon: '召唤', teleport: '传送',
    };
    return map[type] || type || '';
  }

  /**
   * 每帧更新：F1-F8 触发技能 + 悬停 tooltip
   * @param {number} dt 秒
   * @param {object} input Input
   * @param {object} player Player
   */
  update(dt, input, player) {
    this._layout();
    if (!player) return;

    const mouse = input.getMouse();
    this.hoverSlot = this._getSlotAt(mouse.x, mouse.y);

    // F1-F8 触发对应槽技能
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (input.wasKeyJustPressed(HOTKEYS[i])) {
        const skillId = player.hotbar ? player.hotbar[i] : null;
        if (skillId) {
          const w = this._mouseWorld();
          player.castSkill(skillId, w.x, w.y);
        }
        break;
      }
    }

    // 鼠标右键拖拽落点（预留接口）：右键释放在某槽上时通知外部
    if (this.onSkillDrop && mouse.rightPressed && this.hoverSlot >= 0) {
      // 由外部拖拽逻辑决定 skillId；此处仅触发回调
      // 当前不持有拖拽态，留作扩展点
    }

    // 右键点击已绑定槽位 → 清空该槽绑定
    if (mouse.rightPressed && this.hoverSlot >= 0 && player.hotbar) {
      const idx = this.hoverSlot;
      if (player.hotbar[idx]) {
        player.hotbar[idx] = null;
      }
    }

    // tooltip 缓存
    if (this.hoverSlot >= 0 && player.hotbar) {
      const skillId = player.hotbar[this.hoverSlot];
      const skill = skillId ? getSkill(skillId) : null;
      if (skill) {
        const cd = player.cooldowns ? player.cooldowns.get(skillId) : 0;
        const lines = [
          { text: skill.name, color: '#ffe060', bold: true },
          { text: this._typeLabel(skill.type), color: '#a8c8ff' },
        ];
        if (skill.mpCost) lines.push({ text: `魔法消耗 ${skill.mpCost}`, color: '#80a0ff' });
        if (skill.cooldown) lines.push({ text: `冷却 ${skill.cooldown}秒`, color: '#c0c0c0' });
        if (cd && cd > 0) lines.push({ text: `冷却中 ${(cd / 1000).toFixed(1)}秒`, color: '#ff8060' });
        if (skill.range) lines.push({ text: `射程 ${skill.range}格`, color: '#c0c0c0' });
        if (skill.description) lines.push({ text: skill.description, color: '#a89878' });
        this.tooltipText = lines;
        this.tooltipX = mouse.x;
        this.tooltipY = mouse.y;
        this.showTooltip = true;
      } else {
        this.showTooltip = false;
      }
    } else {
      this.showTooltip = false;
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} player
   */
  render(ctx, player) {
    this._layout();
    ctx.save();

    // 半透明底板
    ctx.fillStyle = 'rgba(20, 18, 26, 0.6)';
    ctx.fillRect(this.x - 6, this.y - 4, this.totalW + 12, SLOT_SIZE + 8);
    ctx.strokeStyle = '#6a5a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(this.x - 6 + 0.5, this.y - 4 + 0.5, this.totalW + 12 - 1, SLOT_SIZE + 8 - 1);

    for (let i = 0; i < SLOT_COUNT; i++) {
      this._drawSlot(ctx, i, player);
    }

    ctx.restore();

    // tooltip（独立绘制在顶层）
    if (this.showTooltip && this.tooltipText) {
      this._drawTooltip(ctx);
    }
  }

  /** 绘制单个槽位 */
  _drawSlot(ctx, i, player) {
    const sx = this.x + i * (SLOT_SIZE + GAP);
    const sy = this.y;
    const size = SLOT_SIZE;

    // 槽底
    ctx.fillStyle = '#1a1620';
    ctx.fillRect(sx, sy, size, size);
    ctx.strokeStyle = '#4a3a2a';
    ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, size - 1, size - 1);

    const skillId = player && player.hotbar ? player.hotbar[i] : null;
    const skill = skillId ? getSkill(skillId) : null;

    if (skill) {
      // 技能占位色块
      ctx.fillStyle = SKILL_COLORS[skill.type] || '#888888';
      ctx.fillRect(sx + 4, sy + 4, size - 8, size - 8);

      // 技能名首字
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(skill.name.charAt(0), sx + size / 2, sy + size / 2);
    }

    // F1-F8 标签（左上角）
    ctx.fillStyle = '#e8d8a8';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(HOTKEYS[i], sx + 2, sy + 2);

    // 冷却覆盖（黑色半透明 + 剩余秒数）
    if (skillId && player.cooldowns) {
      const cd = player.cooldowns.get(skillId);
      if (cd && cd > 0) {
        const total = ((skill && skill.cooldown) || 1) * 1000;
        const ratio = Math.min(1, cd / total);
        // 自下而上覆盖
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(sx, sy + size * (1 - ratio), size, size * ratio);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((cd / 1000).toFixed(1), sx + size / 2, sy + size / 2);
      }
    }

    // 悬停高亮
    if (i === this.hoverSlot) {
      ctx.strokeStyle = '#a8c8ff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
    }
  }

  /** 绘制技能 tooltip */
  _drawTooltip(ctx) {
    const lines = this.tooltipText;
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
    const { w: cw, h: ch } = this._cssSize();
    let bx = this.tooltipX + 14;
    let by = this.tooltipY + 14;
    if (bx + boxW > cw) bx = this.tooltipX - boxW - 14;
    if (by + boxH > ch) by = this.tooltipY - boxH - 14;
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

export default SkillBar;
