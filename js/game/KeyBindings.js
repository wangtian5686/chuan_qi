/**
 * KeyBindings.js — 快捷键映射系统与输入处理器
 *
 * 职责：
 * - 维护 KEY_BINDINGS 映射表：动作名 -> KeyboardEvent.code
 * - InputHandler 每帧检测各快捷键是否刚按下，调用 game 对应方法
 * - 支持运行时修改 KEY_BINDINGS（重新赋值动作对应的 code 即可生效）
 *
 * 与 Input 的解耦：仅依赖 Input.wasKeyJustPressed(code) 接口，
 * 不关心按键的按下/抬起维护细节。
 *
 * 与 game 的解耦：InputHandler 通过 game 上的方法调用各子系统，
 * game.ui / game.castHotbarSkill 等接口缺失时安全跳过，便于分阶段联调。
 *
 * 冲突说明（相对原始草案的调整）：
 * - useMpPotion 由 KeyW 改为 KeyR，避免与 WASD 移动冲突
 * - saveMenu 不绑定快捷键，仅通过主菜单 / 暂停菜单访问（原 F5 与 skill5 冲突）
 * - skill1~skill8 统一映射 F1~F8，对应 hotbar 索引 0~7
 */

/**
 * 快捷键映射表
 * 键为动作名，值为 KeyboardEvent.code（见 https://developer.mozilla.org/zh-CN/docs/Web/API/UI_Events/Keyboard_event_code_values）
 * 运行时可整体替换或单条修改，InputHandler 每帧重新读取本对象。
 */
export const KEY_BINDINGS = {
  toggleInventory: 'KeyB', // 背包
  toggleCharacter: 'KeyC', // 角色面板
  toggleSkill: 'KeyV', // 技能面板
  toggleEquipment: 'KeyE', // 装备面板（备用）
  pause: 'Escape', // 暂停/恢复
  skill1: 'F1', // 快捷栏技能槽 0
  skill2: 'F2', // 快捷栏技能槽 1
  skill3: 'F3', // 快捷栏技能槽 2
  skill4: 'F4', // 快捷栏技能槽 3
  skill5: 'F5', // 快捷栏技能槽 4
  skill6: 'F6', // 快捷栏技能槽 5
  skill7: 'F7', // 快捷栏技能槽 6
  skill8: 'F8', // 快捷栏技能槽 7
  toggleMap: 'KeyM', // 大地图（暂留接口）
  chat: 'Enter', // 聊天（暂留接口）
  pickup: 'Space', // 拾取周围物品
  useHpPotion: 'KeyQ', // 快速使用红药
  useMpPotion: 'KeyR', // 快速使用蓝药
};

/**
 * skill1~skill8 动作名 -> hotbar 索引（0~7）的映射表
 * 用于将快捷键转发到 game.castHotbarSkill(index)
 */
const SKILL_INDEX_MAP = {
  skill1: 0,
  skill2: 1,
  skill3: 2,
  skill4: 3,
  skill5: 4,
  skill6: 5,
  skill7: 6,
  skill8: 7,
};

/**
 * 输入处理器：每帧检测快捷键并分发到 game 的对应方法
 *
 * game 接口约定（缺失方法时安全跳过，不抛异常）：
 * - game.ui.toggleInventory() / toggleCharacter() / toggleSkill() / toggleEquipment() / toggleMinimap()
 * - game.togglePause()
 * - game.castHotbarSkill(index)
 * - game.openChat()
 * - game.pickupNearby()
 * - game.useHpPotion() / game.useMpPotion()
 */
export class InputHandler {
  /**
   * @param {object} input Input 实例
   * @param {object} game Game 单例（提供各动作的目标方法）
   */
  constructor(input, game) {
    this.input = input;
    this.game = game;
  }

  /**
   * 每帧调用：检测快捷键刚按下事件并分发
   * @param {number} dt 帧间隔（秒，当前未使用，保留接口）
   */
  update(dt) {
    const input = this.input;
    const game = this.game;
    if (!input || !game) return;

    // 遍历映射表，逐个检测刚按下
    for (const action in KEY_BINDINGS) {
      const code = KEY_BINDINGS[action];
      if (!code) continue;
      if (!input.wasKeyJustPressed(code)) continue;
      this._dispatch(action);
    }
  }

  /**
   * 分发单个动作到 game 的对应方法
   * 方法缺失时静默跳过，便于子系统分阶段接入
   * @param {string} action 动作名
   */
  _dispatch(action) {
    const game = this.game;
    const ui = game.ui;
    switch (action) {
      case 'toggleInventory':
        if (ui && typeof ui.toggleInventory === 'function') ui.toggleInventory();
        break;
      case 'toggleCharacter':
        if (ui && typeof ui.toggleCharacter === 'function') ui.toggleCharacter();
        break;
      case 'toggleSkill':
        if (ui && typeof ui.toggleSkill === 'function') ui.toggleSkill();
        break;
      case 'toggleEquipment':
        if (ui && typeof ui.toggleEquipment === 'function') ui.toggleEquipment();
        break;
      case 'pause':
        if (typeof game.togglePause === 'function') game.togglePause();
        break;
      case 'toggleMap':
        // 大地图暂留接口
        if (ui && typeof ui.toggleMinimap === 'function') ui.toggleMinimap();
        break;
      case 'chat':
        // 聊天暂留接口
        if (typeof game.openChat === 'function') game.openChat();
        break;
      case 'pickup':
        if (typeof game.pickupNearby === 'function') game.pickupNearby();
        break;
      case 'useHpPotion':
        if (typeof game.useHpPotion === 'function') game.useHpPotion();
        break;
      case 'useMpPotion':
        if (typeof game.useMpPotion === 'function') game.useMpPotion();
        break;
      default:
        // skill1~skill8 -> castHotbarSkill(index)
        if (action in SKILL_INDEX_MAP) {
          const idx = SKILL_INDEX_MAP[action];
          if (typeof game.castHotbarSkill === 'function') game.castHotbarSkill(idx);
        }
        break;
    }
  }

  /**
   * 运行时修改单个动作的绑定按键
   * @param {string} action 动作名
   * @param {string|null} code KeyboardEvent.code，传 null 取消绑定
   */
  rebind(action, code) {
    if (!(action in KEY_BINDINGS)) return false;
    KEY_BINDINGS[action] = code;
    return true;
  }
}

export default { KEY_BINDINGS, InputHandler };
