/**
 * SaveWindow.js — 存档 / 读档窗口（Canvas 绘制）
 *
 * 职责：
 * - 列出 1 个自动槽 + 5 个手动槽，显示角色名 / 职业 / 等级 / 地图名 / 存档时间
 * - 鼠标点击选中槽位，选中后弹出确认按钮（保存 / 读取 / 删除）
 * - 通过注入的回调通知 Game 执行实际存读删动作，自身不直接操作存档
 *
 * 构造：new SaveWindow(canvas, input, saveManager, mode='save'|'load')
 *   - canvas/input：复用 Game 的画布与输入（CSS 像素坐标系，与 setTransform(dpr) 后的绘图一致）
 *   - saveManager：SaveManager 实例，用于读取槽位信息
 *   - mode：'save' 显示"保存"按钮，'load' 显示"读取"按钮
 *
 * Game 可设置的回调：
 *   window.onSave(slotId) / onLoad(slotId) / onDelete(slotId) / onClose()
 *
 * 渲染前提：调用方已绘制半透明遮罩；本窗口只绘制面板与内容。
 */

import { getMap } from '../data/maps/index.js';
import { getClass } from '../data/classes.js';
import { SaveManager } from '../save/SaveManager.js';

export class SaveWindow {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} saveManager SaveManager 实例
   * @param {'save'|'load'} mode
   */
  constructor(canvas, input, saveManager, mode = 'save') {
    this.canvas = canvas;
    this.input = input;
    this.saveManager = saveManager;
    this.mode = mode === 'load' ? 'load' : 'save';

    /** 是否可见（Game 控制显隐） */
    this.visible = false;
    /** 当前选中的槽位 id */
    this.selectedSlotId = null;
    /** 鼠标悬停的槽位 id（用于高亮） */
    this.hoverSlotId = null;

    /** 由 Game 注入的动作回调 */
    this.onSave = null;   // (slotId) => void
    this.onLoad = null;   // (slotId) => void
    this.onDelete = null; // (slotId) => void
    this.onClose = null;  // () => void

    /** 最近一次布局结果，供 update 命中检测复用 */
    this._layout = null;
  }

  /** 切换模式并重置选中态 */
  setMode(mode) {
    this.mode = mode === 'load' ? 'load' : 'save';
    this.selectedSlotId = null;
  }

  /** 打开窗口 */
  open() {
    this.visible = true;
    this.selectedSlotId = null;
    // 打开时刷新一次槽位列表，确保元信息最新
    if (this.saveManager && typeof this.saveManager.loadSlotList === 'function') {
      this.saveManager.loadSlotList();
    }
  }

  /** 关闭窗口（触发 onClose 回调） */
  close() {
    this.visible = false;
    this.selectedSlotId = null;
    if (typeof this.onClose === 'function') this.onClose();
  }

  // ===== 布局 =====

  /** 取画布 CSS 像素尺寸（与绘图坐标系一致） */
  _cssSize() {
    const w = this.canvas.clientWidth || this.canvas.width || window.innerWidth;
    const h = this.canvas.clientHeight || this.canvas.height || window.innerHeight;
    return { w, h };
  }

  /**
   * 计算当前帧布局：面板矩形、各槽位矩形、底部按钮矩形
   * - update 与 render 共用同一计算，保证命中与绘制一致
   * @returns {object}
   */
  _computeLayout() {
    const { w: vw, h: vh } = this._cssSize();
    const panelW = Math.min(640, vw - 80);
    const panelH = Math.min(600, vh - 80);
    const panelX = Math.floor((vw - panelW) / 2);
    const panelY = Math.floor((vh - panelH) / 2);

    const padding = 16;
    const titleH = 44;
    const footerH = 60;

    // 槽位列表区域
    const listX = panelX + padding;
    const listY = panelY + titleH + padding;
    const listW = panelW - padding * 2;
    const rowH = 64;
    const rowGap = 6;

    // 槽位顺序：auto 在前，随后 slot1..slot5
    const slotIds = [SaveManager.AUTO_SLOT];
    for (let i = 1; i <= SaveManager.MAX_SLOTS; i++) slotIds.push('slot' + i);

    const slots = slotIds.map((slotId, i) => ({
      slotId,
      rect: {
        x: listX,
        y: listY + i * (rowH + rowGap),
        w: listW,
        h: rowH,
      },
    }));

    // 底部按钮
    const btnY = panelY + panelH - footerH + 12;
    const btnH = 36;
    const btnGap = 10;
    // 按需生成按钮：主操作（保存/读取）+ 删除 + 关闭
    const buttons = [];
    const primaryLabel = this.mode === 'save' ? '保存' : '读取';
    const selectedInfo = this.selectedSlotId
      ? this.saveManager.getSlotInfo(this.selectedSlotId)
      : null;
    const hasSave = !!(selectedInfo && selectedInfo.exists);

    buttons.push({
      id: 'primary',
      label: primaryLabel,
      // 保存模式：始终可用（可覆盖空槽或已有槽）；读取模式：仅在有存档时可用
      enabled: this.mode === 'save' ? !!this.selectedSlotId : (hasSave && !!this.selectedSlotId),
    });
    buttons.push({
      id: 'delete',
      label: '删除',
      enabled: hasSave,
    });
    buttons.push({ id: 'close', label: '关闭', enabled: true });

    // 等宽分布
    const totalBtnW = panelW - padding * 2;
    const btnW = Math.floor((totalBtnW - btnGap * (buttons.length - 1)) / buttons.length);
    buttons.forEach((b, i) => {
      b.rect = {
        x: panelX + padding + i * (btnW + btnGap),
        y: btnY,
        w: btnW,
        h: btnH,
      };
    });

    return {
      panel: { x: panelX, y: panelY, w: panelW, h: panelH },
      slots,
      buttons,
    };
  }

  // ===== 更新 =====

  /**
   * 每帧更新：处理鼠标点击与键盘
   * @param {number} dt 秒（当前未使用，保留接口）
   * @param {object} input Input 实例
   */
  update(dt, input) {
    if (!this.visible) return;
    const inp = input || this.input;
    this._layout = this._computeLayout();

    const mouse = inp.getMouse ? inp.getMouse() : inp.mouse;
    const mx = mouse.x;
    const my = mouse.y;
    const clicked = mouse.leftPressed === true;

    // 悬停检测
    this.hoverSlotId = null;
    for (const s of this._layout.slots) {
      if (this._hit(s.rect, mx, my)) {
        this.hoverSlotId = s.slotId;
        break;
      }
    }

    // ESC 关闭
    if (inp.wasKeyJustPressed && inp.wasKeyJustPressed('Escape')) {
      this.close();
      return;
    }

    if (!clicked) return;

    // 点击槽位 -> 选中
    for (const s of this._layout.slots) {
      if (this._hit(s.rect, mx, my)) {
        this.selectedSlotId = s.slotId;
        return;
      }
    }

    // 点击按钮
    for (const b of this._layout.buttons) {
      if (!b.enabled) continue;
      if (this._hit(b.rect, mx, my)) {
        this._handleButton(b.id);
        return;
      }
    }
  }

  /** 处理底部按钮点击 */
  _handleButton(id) {
    const slotId = this.selectedSlotId;
    switch (id) {
      case 'primary':
        if (!slotId) return;
        if (this.mode === 'save') {
          if (typeof this.onSave === 'function') this.onSave(slotId);
        } else {
          if (typeof this.onLoad === 'function') this.onLoad(slotId);
        }
        break;
      case 'delete':
        if (!slotId) return;
        if (typeof this.onDelete === 'function') this.onDelete(slotId);
        break;
      case 'close':
        this.close();
        break;
    }
  }

  /** 矩形命中检测 */
  _hit(rect, x, y) {
    return (
      x >= rect.x && x <= rect.x + rect.w &&
      y >= rect.y && y <= rect.y + rect.h
    );
  }

  // ===== 渲染 =====

  /**
   * 绘制窗口
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.visible) return;
    const layout = this._computeLayout();
    this._layout = layout;

    const { panel, slots, buttons } = layout;

    // 面板背景
    ctx.fillStyle = 'rgba(8, 12, 24, 0.96)';
    this._roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 10);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6a5a2a';
    ctx.stroke();

    // 标题
    const title = this.mode === 'save' ? '存档' : '读档';
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '24px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, panel.x + 18, panel.y + 24);

    // 槽位
    for (const s of slots) {
      this._renderSlot(ctx, s);
    }

    // 按钮
    for (const b of buttons) {
      this._renderButton(ctx, b);
    }
  }

  /** 绘制单个槽位行 */
  _renderSlot(ctx, s) {
    const { rect, slotId } = s;
    const info = this.saveManager.getSlotInfo(slotId);
    const selected = this.selectedSlotId === slotId;
    const hover = this.hoverSlotId === slotId;

    // 行背景
    if (selected) ctx.fillStyle = 'rgba(106, 90, 42, 0.45)';
    else if (hover) ctx.fillStyle = 'rgba(106, 90, 42, 0.22)';
    else ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 6);
    ctx.fill();
    ctx.lineWidth = selected ? 2 : 1;
    ctx.strokeStyle = selected ? '#ffe9a8' : 'rgba(255,233,168,0.25)';
    ctx.stroke();

    // 槽位标签
    const label = slotId === SaveManager.AUTO_SLOT ? '自动存档' : '存档槽 ' + slotId.replace('slot', '');
    ctx.fillStyle = '#c8b878';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(label, rect.x + 12, rect.y + 8);

    if (info.exists) {
      const cls = getClass(info.classId);
      const className = (cls && cls.name) || info.classId || '';
      const map = getMap(info.mapId);
      const mapName = (map && map.name) || info.mapId || '未知';

      // 角色名 + 职业 + 等级
      ctx.fillStyle = '#ffe9a8';
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      const nameText = `${info.name || '匿名'}  ${className}  Lv.${info.level || 1}`;
      ctx.fillText(nameText, rect.x + 12, rect.y + 28);

      // 地图 + 时间
      ctx.fillStyle = '#9a8e6a';
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      const detail = `${mapName}    ${this._formatTime(info.timestamp)}`;
      ctx.fillText(detail, rect.x + 12, rect.y + 46);
    } else {
      ctx.fillStyle = '#6a6450';
      ctx.font = '15px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('空', rect.x + rect.w / 2, rect.y + rect.h / 2 + 6);
    }
  }

  /** 绘制底部按钮 */
  _renderButton(ctx, b) {
    const { rect, label, enabled } = b;
    const mouse = this.input && this.input.getMouse ? this.input.getMouse() : { x: -1, y: -1 };
    const hover = enabled && this._hit(rect, mouse.x, mouse.y);

    if (!enabled) ctx.fillStyle = 'rgba(255,255,255,0.06)';
    else if (hover) ctx.fillStyle = 'rgba(106,90,42,0.55)';
    else ctx.fillStyle = 'rgba(106,90,42,0.3)';
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 6);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = enabled ? 'rgba(255,233,168,0.5)' : 'rgba(255,233,168,0.15)';
    ctx.stroke();

    ctx.fillStyle = enabled ? '#ffe9a8' : '#6a6450';
    ctx.font = '15px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  // ===== 工具 =====

  /** 圆角矩形路径 */
  _roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  /** 时间戳 -> 'YYYY-MM-DD HH:MM'，无则 '—' */
  _formatTime(ts) {
    if (!ts) return '—';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '—';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
}

export default SaveWindow;
