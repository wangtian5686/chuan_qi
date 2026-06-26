/**
 * UiManager.js — UI 总管理器
 *
 * 职责：
 * - 持有所有 UI 组件实例（HUD + 各类窗口）
 * - 统一驱动 update / render：HUD 常驻，窗口按需显隐
 * - 处理全局快捷键：B 背包 / C 角色 / V 技能
 * - 提供懒加载入口：openShop / openRepair / openTeleportDialog / showDialog / openSaveWindow
 *   （商店 / 修理 / 传送 / 对话 / 存档窗口按需创建，避免启动即加载）
 * - closeAll() 关闭所有面板（暂停菜单 / 切场景时调用）
 *
 * 窗口 z-order（自底向上）：
 *   HUD → inventory / equipment / character / skill →
 *   shop / repair / teleport → dialog → save
 * 输入处理顺序与 z-order 相反（顶层优先消费）。
 *
 * Player 来源：update(dt, input, player) 每帧由 main.js 传入并缓存，
 *   供 open* 方法在事件回调中取用。
 */

import { Hud } from './Hud.js';
import { InventoryWindow } from './InventoryWindow.js';
import { EquipmentWindow } from './EquipmentWindow.js';
import { CharacterWindow } from './CharacterWindow.js';
import { SkillWindow } from './SkillWindow.js';
import { ShopWindow } from './ShopWindow.js';
import { RepairWindow } from './RepairWindow.js';
import { TeleportDialog } from './TeleportDialog.js';
import { DialogBox } from './DialogBox.js';
import { SaveWindow } from './SaveWindow.js';

export class UiManager {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} input Input 实例
   * @param {object} game Game 单例（提供 player / scene / saveManager / fps 等）
   */
  constructor(canvas, input, game) {
    this.canvas = canvas;
    this.input = input;
    this.game = game;

    /** 最近一次 update 传入的 player（供 open* 方法取用） */
    this.player = null;

    // ===== 常驻 / 主要面板（构造即创建） =====
    this.hud = new Hud(canvas, input, game);
    this.inventoryWindow = new InventoryWindow(canvas, input, null);
    this.inventoryWindow.game = game;
    this.equipmentWindow = new EquipmentWindow(canvas, input, null);
    this.characterWindow = new CharacterWindow(canvas, input, null);
    this.skillWindow = new SkillWindow(canvas, input, null);

    // 角色面板点击装备槽 → 打开装备面板
    this.characterWindow.onOpenEquipment = () => {
      this.equipmentWindow.show();
    };

    // ===== 懒加载窗口（首次打开时创建） =====
    this.shopWindow = null;
    this.repairWindow = null;
    this.teleportDialog = null;
    this.dialogBox = null;
    this.saveWindow = null;

    /** 当前顶层活动窗口引用（用于外部查询 / ESC 关闭） */
    this.activeWindow = null;
  }

  /**
   * 把 player 同步给所有已创建的窗口
   * @param {object} player Player 实例
   */
  _syncPlayer(player) {
    this.player = player;
    this.inventoryWindow.player = player;
    this.equipmentWindow.player = player;
    this.characterWindow.player = player;
    this.skillWindow.player = player;
    if (this.shopWindow) this.shopWindow.player = player;
    if (this.repairWindow) this.repairWindow.player = player;
    if (this.teleportDialog) this.teleportDialog.player = player;
  }

  /** 取所有面板窗口（不含 HUD），按 z-order 自底向上 */
  _panelWindows() {
    const list = [
      this.inventoryWindow,
      this.equipmentWindow,
      this.characterWindow,
      this.skillWindow,
    ];
    if (this.shopWindow) list.push(this.shopWindow);
    if (this.repairWindow) list.push(this.repairWindow);
    if (this.teleportDialog) list.push(this.teleportDialog);
    if (this.dialogBox) list.push(this.dialogBox);
    if (this.saveWindow) list.push(this.saveWindow);
    return list;
  }

  /**
   * 每帧更新：HUD + 可见窗口 + 全局快捷键
   * @param {number} dt 秒
   * @param {object} input Input 实例
   * @param {object} player Player 实例
   * @returns {boolean} 是否有窗口消费了本帧鼠标点击（供 main.js 跳过世界点击）
   */
  update(dt, input, player) {
    this._syncPlayer(player);

    // HUD 始终更新（PLAYING 状态下）
    this.hud.update(dt, input, player);

    // 全局快捷键：B 背包 / C 角色 / V 技能
    if (input.wasKeyJustPressed('KeyB')) {
      this.inventoryWindow.toggle();
      if (this.inventoryWindow.visible) this.activeWindow = this.inventoryWindow;
    }
    if (input.wasKeyJustPressed('KeyC')) {
      this.characterWindow.toggle();
      if (this.characterWindow.visible) this.activeWindow = this.characterWindow;
    }
    if (input.wasKeyJustPressed('KeyV')) {
      this.skillWindow.toggle();
      if (this.skillWindow.visible) this.activeWindow = this.skillWindow;
    }

    // 窗口输入处理：顶层优先消费
    let consumed = false;
    const panels = this._panelWindows();
    for (let i = panels.length - 1; i >= 0; i--) {
      const w = panels[i];
      if (!w.visible) continue;
      const c = w.update(dt, input);
      if (c && !consumed) consumed = true;
    }

    // 更新 activeWindow：取最顶层仍可见者
    this.activeWindow = null;
    for (let i = panels.length - 1; i >= 0; i--) {
      if (panels[i].visible) {
        this.activeWindow = panels[i];
        break;
      }
    }

    return consumed;
  }

  /**
   * 渲染：HUD 常驻 + 可见窗口按 z-order 自底向上
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} player Player 实例
   * @param {object} camera Camera 实例
   * @param {object} map IsometricMap 实例
   */
  render(ctx, player, camera, map) {
    // HUD 始终绘制
    this.hud.render(ctx, player, camera, map);

    // 面板窗口按 z-order 自底向上
    const panels = this._panelWindows();
    for (const w of panels) {
      if (w.visible) w.render(ctx);
    }
  }

  // ===== 懒加载入口 =====

  /**
   * 打开商店窗口（懒加载）
   * @param {object} npc Npc 实例（含 shop 列表）
   */
  openShop(npc) {
    if (!this.shopWindow) {
      this.shopWindow = new ShopWindow(this.canvas, this.input, this.player, npc);
    } else {
      this.shopWindow.npc = npc;
      this.shopWindow.player = this.player;
    }
    this.shopWindow.show();
    this.activeWindow = this.shopWindow;
  }

  /** 打开修理窗口（懒加载） */
  openRepair() {
    if (!this.repairWindow) {
      this.repairWindow = new RepairWindow(this.canvas, this.input, this.player);
    } else {
      this.repairWindow.player = this.player;
    }
    this.repairWindow.show();
    this.activeWindow = this.repairWindow;
  }

  /**
   * 打开传送员对话窗口（懒加载）
   * @param {object} npc Npc 实例
   * @param {Array<{label, targetMap, targetX, targetY, cost}>} destinations 可选目的地
   */
  openTeleportDialog(npc, destinations) {
    if (!this.teleportDialog) {
      this.teleportDialog = new TeleportDialog(this.canvas, this.input, this.player, npc, destinations);
    } else {
      this.teleportDialog.npc = npc;
      this.teleportDialog.player = this.player;
      this.teleportDialog.destinations = Array.isArray(destinations) ? destinations.slice() : [];
    }
    // 注入 game 引用（TeleportDialog 内部通过 this.game.teleportTo 传送）
    this.teleportDialog.game = this.game;
    this.teleportDialog.show();
    this.activeWindow = this.teleportDialog;
  }

  /**
   * 显示通用对话框（懒加载；每次复用同一实例，更新文本与选项）
   * @param {string} text 对话文本
   * @param {Array<{label, action?, close?}>} options 选项列表
   */
  showDialog(text, options) {
    if (this.dialogBox) {
      // 复用：更新内容
      this.dialogBox.text = text || '';
      this.dialogBox.options = Array.isArray(options) ? options.slice() : [];
      this.dialogBox._layout && this.dialogBox._layout();
    } else {
      this.dialogBox = new DialogBox(this.canvas, this.input, text, options);
    }
    this.dialogBox.show();
    this.activeWindow = this.dialogBox;
  }

  /**
   * 打开存档 / 读档窗口（懒加载）
   * @param {'save'|'load'} mode
   */
  openSaveWindow(mode = 'save') {
    const saveManager = this.game && this.game.saveManager;
    if (!saveManager) return; // 无存档管理器，忽略
    if (!this.saveWindow) {
      this.saveWindow = new SaveWindow(this.canvas, this.input, saveManager, mode);
    } else {
      this.saveWindow.saveManager = saveManager;
      this.saveWindow.setMode(mode);
    }
    if (typeof this.saveWindow.open === 'function') {
      this.saveWindow.open();
    } else {
      this.saveWindow.visible = true;
    }
    this.activeWindow = this.saveWindow;
  }

  /** 关闭所有面板（HUD 不受影响） */
  closeAll() {
    const panels = this._panelWindows();
    for (const w of panels) {
      if (w.visible) {
        if (typeof w.hide === 'function') w.hide();
        else if (typeof w.close === 'function') w.close();
        else w.visible = false;
      }
    }
    this.activeWindow = null;
  }
}

export default UiManager;
