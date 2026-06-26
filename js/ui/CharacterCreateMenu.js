/**
 * CharacterCreateMenu.js — 角色创建界面（Canvas 绘制）
 *
 * 职责：
 * - 两步流程：classSelect（选择职业） -> nameInput（输入名字）
 * - classSelect：三张职业卡片横向排列，鼠标点击或左右方向键切换，
 *   下方显示职业描述 / 起始属性 / 起始技能，"下一步"按钮进入 nameInput
 * - nameInput：文本输入框（支持中英文，监听 keydown 与 compositionend），
 *   名字长度 1~12 字符，"确认创建"按钮触发 onConfirm(classId, name)，"返回"按钮回退
 *
 * 与 Game 的通信：通过回调 onConfirm(classId, name)，由 main.js 在联调时注入。
 *
 * 文本输入实现：
 * - Input.js 仅维护按键 code 集合，无法获取输入字符，故本类在 show() 时
 *   自行挂载 window keydown / compositionend 监听，hide() 时摘除
 * - keydown 处理 Backspace / Enter / Escape 及单字符直接输入
 * - compositionend 处理中文 IME 组字提交（e.data）
 * - 组字进行中（e.isComposing / keyCode 229）忽略 keydown，避免重复
 *
 * 坐标约定：使用 canvas 的 CSS 像素尺寸（与 setTransform(dpr) 后的绘图坐标系一致）。
 */

import { getClass } from '../data/classes.js';
import { getSkill } from '../data/skills.js';

/** 名字最大长度 */
const NAME_MAX = 12;
/** 名字最小长度 */
const NAME_MIN = 1;

/** 职业卡片展示顺序 */
const CLASS_ORDER = ['warrior', 'mage', 'taoist'];

export class CharacterCreateMenu {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   */
  constructor(canvas, input) {
    this.canvas = canvas;
    this.input = input;

    /** 是否可见 */
    this.visible = false;
    /** 当前步骤：'classSelect' | 'nameInput' */
    this.step = 'classSelect';
    /** 选中的职业 id */
    this.selectedClass = 'warrior';
    /** 输入的角色名 */
    this.name = '';

    /** 由 Game 注入的确认回调 */
    this.onConfirm = null; // (classId, name) => void

    /** 鼠标悬停的卡片索引（-1 表示无） */
    this.hoverClassIndex = -1;
    /** 最近一次布局结果，供 update 命中检测复用 */
    this._layout = null;

    // 文本输入事件处理绑定
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onCompositionEnd = this._onCompositionEnd.bind(this);
  }

  /** 显示并重置到职业选择步骤 */
  show() {
    this.visible = true;
    this.step = 'classSelect';
    this.selectedClass = 'warrior';
    this.name = '';
    this.hoverClassIndex = -1;
    this._attachTextInput();
  }

  /** 隐藏并清理输入监听 */
  hide() {
    this.visible = false;
    this._detachTextInput();
  }

  // ===== 文本输入监听 =====

  _attachTextInput() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('compositionend', this._onCompositionEnd);
  }

  _detachTextInput() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('compositionend', this._onCompositionEnd);
  }

  /** keydown：处理控制键与单字符输入 */
  _onKeyDown(e) {
    if (!this.visible || this.step !== 'nameInput') return;
    // IME 组字中，忽略 keydown（由 compositionend 处理）
    if (e.isComposing || e.keyCode === 229) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      this.name = this.name.slice(0, -1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      this._tryConfirm();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.step = 'classSelect';
      return;
    }
    // 可打印单字符（含英文、中文直接键入）
    if (e.key.length === 1) {
      if (this.name.length >= NAME_MAX) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      this.name += e.key;
    }
  }

  /** compositionend：中文 IME 组字提交 */
  _onCompositionEnd(e) {
    if (!this.visible || this.step !== 'nameInput') return;
    const data = e.data || '';
    if (!data) return;
    const remain = NAME_MAX - this.name.length;
    if (remain <= 0) return;
    this.name += data.slice(0, remain);
  }

  // ===== 工具 =====

  /** 取画布 CSS 像素尺寸 */
  _cssSize() {
    const w = this.canvas.clientWidth || this.canvas.width || window.innerWidth;
    const h = this.canvas.clientHeight || this.canvas.height || window.innerHeight;
    return { w, h };
  }

  /** 矩形命中检测 */
  _hit(rect, x, y) {
    return (
      x >= rect.x && x <= rect.x + rect.w &&
      y >= rect.y && y <= rect.y + rect.h
    );
  }

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

  /** 名字是否合法（长度 1~12） */
  _isNameValid() {
    return this.name.length >= NAME_MIN && this.name.length <= NAME_MAX;
  }

  // ===== 布局 =====

  /**
   * classSelect 步骤布局：标题 / 三张卡片 / 属性面板 / 下一步按钮
   */
  _computeClassSelectLayout() {
    const { w: vw, h: vh } = this._cssSize();

    const cardW = Math.min(200, Math.floor((vw - 120) / 3));
    const cardH = 240;
    const gap = 20;
    const totalW = cardW * 3 + gap * 2;
    const startX = Math.floor((vw - totalW) / 2);
    const cardY = Math.floor(vh * 0.22);

    const cards = CLASS_ORDER.map((classId, i) => ({
      classId,
      index: i,
      rect: {
        x: startX + i * (cardW + gap),
        y: cardY,
        w: cardW,
        h: cardH,
      },
    }));

    // 属性面板（卡片下方）
    const panelW = Math.min(640, vw - 80);
    const panelX = Math.floor((vw - panelW) / 2);
    const panelY = cardY + cardH + 20;
    const panelH = Math.min(180, vh - panelY - 90);

    // "下一步"按钮
    const btnW = 160;
    const btnH = 42;
    const btnX = Math.floor((vw - btnW) / 2);
    const btnY = panelY + panelH + 16;
    const nextBtn = { id: 'next', label: '下一步', rect: { x: btnX, y: btnY, w: btnW, h: btnH } };

    return { vw, vh, cards, panel: { x: panelX, y: panelY, w: panelW, h: panelH }, nextBtn };
  }

  /**
   * nameInput 步骤布局：标题 / 输入框 / 确认 + 返回按钮
   */
  _computeNameInputLayout() {
    const { w: vw, h: vh } = this._cssSize();
    const cx = Math.floor(vw / 2);

    // 输入框
    const inputW = Math.min(360, vw - 80);
    const inputH = 44;
    const inputX = Math.floor(cx - inputW / 2);
    const inputY = Math.floor(vh * 0.38);

    // 按钮
    const btnW = 140;
    const btnH = 42;
    const btnGap = 24;
    const btnY = inputY + inputH + 40;
    const totalBtnW = btnW * 2 + btnGap;
    const btnStartX = Math.floor(cx - totalBtnW / 2);
    const confirmBtn = {
      id: 'confirm',
      label: '确认创建',
      rect: { x: btnStartX, y: btnY, w: btnW, h: btnH },
    };
    const backBtn = {
      id: 'back',
      label: '返回',
      rect: { x: btnStartX + btnW + btnGap, y: btnY, w: btnW, h: btnH },
    };

    return { vw, vh, cx, input: { x: inputX, y: inputY, w: inputW, h: inputH }, confirmBtn, backBtn };
  }

  // ===== 更新 =====

  /**
   * 每帧更新交互
   * @param {number} dt 秒（当前未使用，保留接口）
   * @param {object} input Input 实例
   */
  update(dt, input) {
    if (!this.visible) return;
    const inp = input || this.input;
    const mouse = inp.getMouse ? inp.getMouse() : inp.mouse;
    const mx = mouse.x;
    const my = mouse.y;

    if (this.step === 'classSelect') {
      this._updateClassSelect(inp, mx, my);
    } else {
      this._updateNameInput(inp, mx, my);
    }
  }

  /** classSelect 步骤更新 */
  _updateClassSelect(inp, mx, my) {
    const layout = this._computeClassSelectLayout();
    this._layout = layout;

    // 鼠标悬停卡片
    this.hoverClassIndex = -1;
    for (const c of layout.cards) {
      if (this._hit(c.rect, mx, my)) {
        this.hoverClassIndex = c.index;
        break;
      }
    }
    // 悬停同步选中
    if (this.hoverClassIndex >= 0) {
      this.selectedClass = CLASS_ORDER[this.hoverClassIndex];
    }

    // 左右方向键切换职业
    if (inp.wasKeyJustPressed && inp.wasKeyJustPressed('ArrowLeft')) {
      this._moveClass(-1);
    }
    if (inp.wasKeyJustPressed && inp.wasKeyJustPressed('ArrowRight')) {
      this._moveClass(1);
    }

    // 回车进入下一步
    if (inp.wasKeyJustPressed && inp.wasKeyJustPressed('Enter')) {
      this.step = 'nameInput';
      this.name = '';
      return;
    }

    // 鼠标点击：卡片选中 / 下一步按钮
    if (inp.getMouse && inp.getMouse().leftPressed === true) {
      for (const c of layout.cards) {
        if (this._hit(c.rect, mx, my)) {
          this.selectedClass = c.classId;
          return;
        }
      }
      if (this._hit(layout.nextBtn.rect, mx, my)) {
        this.step = 'nameInput';
        this.name = '';
        return;
      }
    }
  }

  /** nameInput 步骤更新 */
  _updateNameInput(inp, mx, my) {
    const layout = this._computeNameInputLayout();
    this._layout = layout;

    // 鼠标点击按钮
    if (inp.getMouse && inp.getMouse().leftPressed === true) {
      if (this._hit(layout.confirmBtn.rect, mx, my)) {
        this._tryConfirm();
        return;
      }
      if (this._hit(layout.backBtn.rect, mx, my)) {
        this.step = 'classSelect';
        return;
      }
    }
    // 注：字符输入由 window keydown 监听处理，此处不重复
  }

  /** 左右方向键切换职业 */
  _moveClass(dir) {
    const n = CLASS_ORDER.length;
    let i = CLASS_ORDER.indexOf(this.selectedClass);
    if (i < 0) i = 0;
    i = (i + dir + n) % n;
    this.selectedClass = CLASS_ORDER[i];
  }

  /** 尝试确认创建（名字不合法则忽略） */
  _tryConfirm() {
    if (!this._isNameValid()) return;
    if (typeof this.onConfirm === 'function') {
      this.onConfirm(this.selectedClass, this.name);
    }
  }

  // ===== 渲染 =====

  /**
   * 绘制角色创建界面
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    if (!this.visible) return;
    const { w: vw, h: vh } = this._cssSize();

    // 背景
    ctx.fillStyle = '#081020';
    ctx.fillRect(0, 0, vw, vh);

    if (this.step === 'classSelect') {
      this._renderClassSelect(ctx);
    } else {
      this._renderNameInput(ctx);
    }
  }

  /** 绘制职业选择步骤 */
  _renderClassSelect(ctx) {
    const layout = this._computeClassSelectLayout();
    this._layout = layout;
    const { vw, vh, cards, panel, nextBtn } = layout;

    // 标题
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('选择职业', vw / 2, Math.floor(vh * 0.1));

    // 职业卡片
    for (const c of cards) {
      this._renderClassCard(ctx, c);
    }

    // 属性面板
    this._renderStatsPanel(ctx, panel);

    // 下一步按钮
    this._renderButton(ctx, nextBtn, true);

    // 操作提示
    ctx.fillStyle = '#9aa0b0';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('鼠标点击或 ← → 切换职业，回车进入下一步', vw / 2, vh - 12);
  }

  /** 绘制单张职业卡片 */
  _renderClassCard(ctx, c) {
    const { rect, classId } = c;
    const cls = getClass(classId);
    const selected = this.selectedClass === classId;
    const hover = this.hoverClassIndex === c.index;

    // 卡片背景
    if (selected) ctx.fillStyle = 'rgba(200,144,42,0.35)';
    else if (hover) ctx.fillStyle = 'rgba(106,90,42,0.22)';
    else ctx.fillStyle = 'rgba(20,40,80,0.55)';
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 10);
    ctx.fill();

    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeStyle = selected ? '#ffe9a8' : 'rgba(255,233,168,0.4)';
    ctx.stroke();

    if (!cls) return;

    // 职业占位色块（与 Player 占位色一致）
    const colorMap = { warrior: '#c8902a', mage: '#3a7bd5', taoist: '#3aa860' };
    const color = colorMap[classId] || '#888888';
    const blockY = rect.y + 24;
    const blockW = Math.min(rect.w - 32, 80);
    ctx.fillStyle = color;
    this._roundRect(ctx, rect.x + (rect.w - blockW) / 2, blockY, blockW, 90, 6);
    ctx.fill();

    // 职业名
    ctx.fillStyle = selected ? '#ffe9a8' : '#e8d8a0';
    ctx.font = 'bold 22px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(cls.name, rect.x + rect.w / 2, blockY + 45);

    // 描述
    ctx.fillStyle = '#9ab0d8';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    this._drawWrappedText(ctx, cls.description, rect.x + 12, rect.y + 140, rect.w - 24, 18);

    // 起始技能简述
    const skillNames = (cls.startSkills || [])
      .map((id) => (getSkill(id) && getSkill(id).name) || id)
      .join('、');
    ctx.fillStyle = '#80e080';
    ctx.font = '12px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('起始技能：' + (skillNames || '无'), rect.x + rect.w / 2, rect.y + rect.h - 24);
  }

  /** 绘制属性面板 */
  _renderStatsPanel(ctx, panel) {
    const cls = getClass(this.selectedClass);
    if (!cls) return;

    // 面板背景
    ctx.fillStyle = 'rgba(8,12,24,0.7)';
    this._roundRect(ctx, panel.x, panel.y, panel.w, panel.h, 8);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(106,90,42,0.6)';
    ctx.stroke();

    // 标题
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 18px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${cls.name} · 1 级起始属性`, panel.x + 16, panel.y + 12);

    // 属性表（两列）
    const b = cls.base;
    const rows = [
      ['生命', `${b.hp}`],
      ['魔法', `${b.mp}`],
      ['攻击', `${b.minAtk}-${b.maxAtk}`],
      ['魔法攻击', `${b.minMatk}-${b.maxMatk}`],
      ['防御', `${b.def}`],
      ['魔防', `${b.mdef}`],
      ['命中', `${b.hit}`],
      ['闪避', `${b.dodge}`],
      ['攻击距离', `${b.attackRange} 格`],
      ['移动速度', `${b.moveSpeed}`],
      ['攻击速度', `${b.attackSpeed}`],
    ];
    const colW = Math.floor((panel.w - 32) / 2);
    const rowH = 20;
    const startY = panel.y + 42;
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    rows.forEach((r, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = panel.x + 16 + col * colW;
      const y = startY + row * rowH;
      ctx.fillStyle = '#9a8e6a';
      ctx.textAlign = 'left';
      ctx.fillText(r[0] + '：', x, y);
      ctx.fillStyle = '#e8d8a0';
      ctx.textAlign = 'left';
      ctx.fillText(r[1], x + 72, y);
    });
  }

  /** 绘制名字输入步骤 */
  _renderNameInput(ctx) {
    const layout = this._computeNameInputLayout();
    this._layout = layout;
    const { vw, vh, input, confirmBtn, backBtn } = layout;

    // 标题
    const cls = getClass(this.selectedClass);
    ctx.fillStyle = '#ffe9a8';
    ctx.font = 'bold 30px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('输入角色名', vw / 2, Math.floor(vh * 0.18));

    // 选中职业提示
    ctx.fillStyle = '#b8d4ff';
    ctx.font = '16px "Microsoft YaHei", sans-serif';
    ctx.fillText(`职业：${cls ? cls.name : this.selectedClass}`, vw / 2, Math.floor(vh * 0.26));

    // 输入框
    ctx.fillStyle = 'rgba(20,30,50,0.9)';
    this._roundRect(ctx, input.x, input.y, input.w, input.h, 6);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#6a5a2a';
    ctx.stroke();

    // 输入框内文字 + 光标
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '20px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const textY = input.y + input.h / 2;
    const textX = input.x + 14;
    const display = this.name || '';
    ctx.fillText(display, textX, textY);
    // 光标（闪烁效果用帧数取模）
    const textW = ctx.measureText(display).width;
    if ((Math.floor(performance.now() / 500) % 2) === 0) {
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(textX + textW + 2, input.y + 10, 2, input.h - 20);
    }

    // 占位提示
    if (!display) {
      ctx.fillStyle = '#5a5448';
      ctx.font = '16px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('请输入角色名（1~12 字符，支持中英文）', textX, textY);
    }

    // 字数统计
    ctx.fillStyle = this._isNameValid() ? '#80e080' : '#ffa060';
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${this.name.length}/${NAME_MAX}`, input.x + input.w - 10, input.y - 14);

    // 按钮
    const valid = this._isNameValid();
    this._renderButton(ctx, confirmBtn, valid);
    this._renderButton(ctx, backBtn, true);

    // 操作提示
    ctx.fillStyle = '#9aa0b0';
    ctx.font = '13px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('输入字符录入名字，Backspace 删除，回车确认，Esc 返回', vw / 2, vh - 12);
  }

  /** 绘制按钮（enabled 控制是否可点击/高亮） */
  _renderButton(ctx, btn, enabled) {
    const { rect, label } = btn;
    const mouse = this.input && this.input.getMouse ? this.input.getMouse() : { x: -1, y: -1 };
    const hover = enabled && this._hit(rect, mouse.x, mouse.y);

    if (!enabled) ctx.fillStyle = 'rgba(255,255,255,0.06)';
    else if (hover) ctx.fillStyle = 'rgba(200,144,42,0.55)';
    else ctx.fillStyle = 'rgba(200,144,42,0.3)';
    this._roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 6);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = enabled ? 'rgba(255,233,168,0.6)' : 'rgba(255,233,168,0.15)';
    ctx.stroke();

    ctx.fillStyle = enabled ? '#ffe9a8' : '#6a6450';
    ctx.font = '17px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
  }

  /** 简单中文换行绘制 */
  _drawWrappedText(ctx, text, x, y, maxW, lineH) {
    if (!text) return;
    let line = '';
    let cy = y;
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, cy);
        line = ch;
        cy += lineH;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, cy);
  }
}

export default CharacterCreateMenu;
