/**
 * eventEmitter.js — 极简事件总线
 * 提供 on/off/once/emit，用于模块解耦（如输入事件、状态变更、伤害结算等）。
 */

export class EventEmitter {
  constructor() {
    /** @type {Map<string, Set<Function>>} 事件名 -> 监听器集合 */
    this._listeners = new Map();
  }

  /** 注册监听器，返回 this 以便链式调用 */
  on(event, fn) {
    if (typeof fn !== 'function') return this;
    let set = this._listeners.get(event);
    if (!set) {
      set = new Set();
      this._listeners.set(event, set);
    }
    set.add(fn);
    return this;
  }

  /** 注册一次性监听器，触发后自动移除 */
  once(event, fn) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      fn(...args);
    };
    // 关联原始函数以便外部 off(fn) 也能取消
    wrapper._origin = fn;
    return this.on(event, wrapper);
  }

  /** 移除监听器（支持移除 once 注册的包装函数） */
  off(event, fn) {
    const set = this._listeners.get(event);
    if (!set) return this;
    if (!fn) {
      set.clear();
      return this;
    }
    // 直接匹配或匹配 once 包装
    for (const cb of set) {
      if (cb === fn || cb._origin === fn) {
        set.delete(cb);
        break;
      }
    }
    return this;
  }

  /** 触发事件，按注册顺序同步调用所有监听器 */
  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set || set.size === 0) return this;
    // 拷贝一份避免监听器在回调中增删导致迭代异常
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[EventEmitter] 监听器异常 (${event}):`, err);
      }
    }
    return this;
  }

  /** 移除某事件全部监听器；不传 event 则清空所有 */
  removeAllListeners(event) {
    if (event) {
      this._listeners.delete(event);
    } else {
      this._listeners.clear();
    }
    return this;
  }
}

export default EventEmitter;
