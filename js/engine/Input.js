/**
 * Input.js — 输入系统
 *
 * 统一管理鼠标与键盘状态，供游戏循环每帧查询：
 * - 鼠标：屏幕坐标 (x,y)、世界坐标 (worldX,worldY)（由外部 Camera 同步）、
 *   左/右键当前是否按下 (leftDown/rightDown)、本帧是否刚按下 (leftPressed/rightPressed)。
 * - 键盘：keys 集合（当前按下的 code）、justPressed 集合（本帧刚按下，update() 后清空）。
 * - 阻止右键菜单与滚轮默认缩放，避免干扰游戏操作。
 *
 * 用法：每帧逻辑末尾调用 input.update() 重置"刚按下"瞬时状态。
 */

export class Input {
  /**
   * @param {HTMLCanvasElement} canvas 目标 canvas，鼠标坐标相对其计算
   */
  constructor(canvas) {
    this.canvas = canvas;

    /** 鼠标状态 */
    this.mouse = {
      x: 0,            // 屏幕坐标 X（相对 canvas）
      y: 0,            // 屏幕坐标 Y（相对 canvas）
      worldX: 0,       // 世界坐标 X（由 Camera 每帧回写）
      worldY: 0,       // 世界坐标 Y（由 Camera 每帧回写）
      leftDown: false,   // 左键当前是否按下
      rightDown: false,  // 右键当前是否按下
      leftPressed: false,  // 本帧左键刚按下（瞬时）
      rightPressed: false, // 本帧右键刚按下（瞬时）
      wheelDelta: 0,    // 本帧滚轮累计增量（向上正、向下负），update() 后清零
    };

    /** 当前按下的键盘 code 集合 */
    this.keys = new Set();
    /** 本帧刚按下的键盘 code 集合（瞬时，update() 后清空） */
    this.justPressed = new Set();

    // 绑定 this
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onContextMenu = this._onContextMenu.bind(this);
    this._onWheel = this._onWheel.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp = this._onKeyUp.bind(this);
    this._onBlur = this._onBlur.bind(this);

    this._attach();
  }

  /** 绑定事件监听 */
  _attach() {
    const c = this.canvas;
    c.addEventListener('mousedown', this._onMouseDown);
    c.addEventListener('mouseup', this._onMouseUp);
    c.addEventListener('mousemove', this._onMouseMove);
    c.addEventListener('contextmenu', this._onContextMenu);
    c.addEventListener('wheel', this._onWheel, { passive: false });

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    // 失焦时清空所有按键，避免松开事件丢失导致"卡键"
    window.addEventListener('blur', this._onBlur);
  }

  /** 解绑事件监听（切换场景/销毁时调用） */
  detach() {
    const c = this.canvas;
    c.removeEventListener('mousedown', this._onMouseDown);
    c.removeEventListener('mouseup', this._onMouseUp);
    c.removeEventListener('mousemove', this._onMouseMove);
    c.removeEventListener('contextmenu', this._onContextMenu);
    c.removeEventListener('wheel', this._onWheel);

    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('blur', this._onBlur);
  }

  /**
   * 将客户端坐标转换为相对 canvas 的坐标。
   * 返回 CSS 像素坐标，与渲染层（ctx 使用 setTransform(dpr) 按 CSS 像素绘制）、
   * Camera 视口坐标系保持一致，避免高 DPI 屏幕下错位。
   */
  _toCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  _onMouseDown(e) {
    const p = this._toCanvas(e.clientX, e.clientY);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    if (e.button === 0) {
      this.mouse.leftDown = true;
      this.mouse.leftPressed = true;
    } else if (e.button === 2) {
      this.mouse.rightDown = true;
      this.mouse.rightPressed = true;
    }
  }

  _onMouseUp(e) {
    const p = this._toCanvas(e.clientX, e.clientY);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
    if (e.button === 0) {
      this.mouse.leftDown = false;
    } else if (e.button === 2) {
      this.mouse.rightDown = false;
    }
  }

  _onMouseMove(e) {
    const p = this._toCanvas(e.clientX, e.clientY);
    this.mouse.x = p.x;
    this.mouse.y = p.y;
  }

  _onContextMenu(e) {
    // 阻止右键菜单默认行为，游戏内右键常用于施法/交互
    e.preventDefault();
  }

  _onWheel(e) {
    e.preventDefault();
    this.mouse.wheelDelta += e.deltaY;
  }

  _onKeyDown(e) {
    const code = e.code;
    // 防止某些按键的默认行为干扰游戏（如方向键滚动页面、空格滚屏）
    if (Input.PREVENT_DEFAULT_CODES.has(code)) {
      e.preventDefault();
    }
    if (!this.keys.has(code)) {
      this.justPressed.add(code);
    }
    this.keys.add(code);
  }

  _onKeyUp(e) {
    this.keys.delete(e.code);
  }

  _onBlur() {
    // 失焦清空状态，防止"卡键"
    this.keys.clear();
    this.justPressed.clear();
    this.mouse.leftDown = false;
    this.mouse.rightDown = false;
  }

  // ===== 查询接口 =====

  /** 某键当前是否按下 */
  isKeyDown(code) {
    return this.keys.has(code);
  }

  /** 某键是否在本帧刚按下（瞬时） */
  wasKeyJustPressed(code) {
    return this.justPressed.has(code);
  }

  /** 获取鼠标状态对象（引用，外部可直接读，不应修改） */
  getMouse() {
    return this.mouse;
  }

  /** 本帧滚轮增量（向上为负、向下为正，与 deltaY 一致） */
  getWheelDelta() {
    return this.mouse.wheelDelta;
  }

  /**
   * 每帧末尾调用：重置瞬时状态（刚按下、滚轮增量）。
   * 注意：世界坐标 worldX/worldY 由 Camera 在每帧更新中回写，此处不清零。
   */
  update() {
    this.justPressed.clear();
    this.mouse.leftPressed = false;
    this.mouse.rightPressed = false;
    this.mouse.wheelDelta = 0;
  }
}

/** 需要阻止默认行为的按键集合（避免页面滚动等） */
Input.PREVENT_DEFAULT_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'Tab',
]);

export default Input;
