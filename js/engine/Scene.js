/**
 * Scene.js — 游戏场景容器
 *
 * 职责：
 * - 持有当前地图（IsometricMap）与所有实体集合
 * - 实体类型：player / monsters / npcs / drops / projectiles / summons
 * - update(dt, input, game)：驱动所有实体的 update，处理投射物移动/命中、掉落物拾取
 * - render(ctx, camera, assetLoader)：
 *     1. 调用 IsometricMap 渲染地面层
 *     2. 收集所有可见 sprite（实体 + 物体层瓦片），按世界 Y 排序后统一绘制
 *     3. 投射物、掉落物作为 sprite 一同参与排序
 *
 * 实体接口约定（鸭子类型）：
 * - 实体需有 update(dt, input, game, scene) 方法（可缺省）
 * - 实体需有 getSprite() 方法返回 {sortY, draw(ctx)}，或提供 worldX/worldY 与 sprite
 *   字段供 Scene 默认包装
 * - 实体可提供 dead 标记，Scene 在 update 后统一清理
 */

import { SpriteRenderer } from './SpriteRenderer.js';

export class Scene {
  /**
   * @param {import('./IsometricMap.js').IsometricMap} map
   */
  constructor(map) {
    this.map = map;

    this.player = null;
    this.monsters = [];
    this.npcs = [];
    this.drops = [];       // 地面掉落物
    this.projectiles = []; // 投射物
    this.summons = [];     // 召唤物（道士神兽/骷髅等）
  }

  // ===== 实体管理 =====

  /**
   * 添加实体到对应集合
   * @param {'player'|'monster'|'npc'|'drop'|'projectile'|'summon'} type
   * @param {object} entity
   */
  addEntity(type, entity) {
    switch (type) {
      case 'player':
        this.player = entity;
        break;
      case 'monster':
        this.monsters.push(entity);
        break;
      case 'npc':
        this.npcs.push(entity);
        break;
      case 'drop':
        this.drops.push(entity);
        break;
      case 'projectile':
        this.projectiles.push(entity);
        break;
      case 'summon':
        this.summons.push(entity);
        break;
      default:
        // 未知类型忽略
        break;
    }
  }

  /**
   * 移除实体
   * @param {'player'|'monster'|'npc'|'drop'|'projectile'|'summon'} type
   * @param {object} entity
   */
  removeEntity(type, entity) {
    let arr;
    switch (type) {
      case 'player':
        if (this.player === entity) this.player = null;
        return;
      case 'monster': arr = this.monsters; break;
      case 'npc': arr = this.npcs; break;
      case 'drop': arr = this.drops; break;
      case 'projectile': arr = this.projectiles; break;
      case 'summon': arr = this.summons; break;
      default: return;
    }
    const i = arr.indexOf(entity);
    if (i >= 0) arr.splice(i, 1);
  }

  /** 获取某类型实体集合（便于外部遍历） */
  getEntities(type) {
    switch (type) {
      case 'player': return this.player ? [this.player] : [];
      case 'monster': return this.monsters;
      case 'npc': return this.npcs;
      case 'drop': return this.drops;
      case 'projectile': return this.projectiles;
      case 'summon': return this.summons;
      default: return [];
    }
  }

  /**
   * 查询范围内实体（世界坐标距离）
   * @param {number} x 世界 X
   * @param {number} y 世界 Y
   * @param {number} range 范围（像素）
   * @param {string[]} [types] 限定类型，默认全部
   * @returns {Array<{entity:object, type:string, dist:number}>}
   */
  getEntitiesInRange(x, y, range, types) {
    const allTypes = types || ['player', 'monster', 'npc', 'drop', 'projectile', 'summon'];
    const result = [];
    const r2 = range * range;
    for (const t of allTypes) {
      const list = this.getEntities(t);
      for (const e of list) {
        if (!e) continue;
        const ex = e.worldX != null ? e.worldX : (e.x || 0);
        const ey = e.worldY != null ? e.worldY : (e.y || 0);
        const dx = ex - x;
        const dy = ey - y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2) {
          result.push({ entity: e, type: t, dist: Math.sqrt(d2) });
        }
      }
    }
    return result;
  }

  // ===== 更新 =====

  /**
   * @param {number} dt 秒
   * @param {import('./Input.js').Input} input
   * @param {object} game Game 单例（提供 camera/assets 等）
   */
  update(dt, input, game) {
    const updateOne = (e) => {
      if (!e) return;
      if (typeof e.update === 'function') {
        e.update(dt, input, game, this);
      }
    };

    updateOne(this.player);
    for (const m of this.monsters) updateOne(m);
    for (const n of this.npcs) updateOne(n);
    for (const s of this.summons) updateOne(s);
    for (const p of this.projectiles) updateOne(p);
    for (const d of this.drops) updateOne(d);

    // 投射物命中与过期清理
    this._updateProjectiles();
    // 掉落物拾取
    this._updateDrops(game);
    // 清理标记为 dead 的实体
    this._cleanupDead();
  }

  /** 投射物：移动与命中由投射物自身 update 处理，这里只做过期/死亡清理 */
  _updateProjectiles() {
    // 实体自身 update 已处理移动与命中判定；
    // 此处仅做统一清理（dead 标记或生命周期结束）。
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p || p.dead) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  /** 掉落物自动拾取：玩家进入拾取范围则触发 onPickup */
  _updateDrops(game) {
    if (!this.player) return;
    const px = this.player.worldX != null ? this.player.worldX : (this.player.x || 0);
    const py = this.player.worldY != null ? this.player.worldY : (this.player.y || 0);
    const pickRange = (this.player.pickupRange || 24);
    const r2 = pickRange * pickRange;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (!d || d.dead) {
        this.drops.splice(i, 1);
        continue;
      }
      const dx = (d.worldX != null ? d.worldX : d.x) - px;
      const dy = (d.worldY != null ? d.worldY : d.y) - py;
      if (dx * dx + dy * dy <= r2) {
        if (typeof d.onPickup === 'function') {
          const ok = d.onPickup(this.player, game);
          if (ok !== false) {
            this.drops.splice(i, 1);
          }
        }
      }
    }
  }

  /** 清理所有集合中标记 dead 的实体 */
  _cleanupDead() {
    const filter = (arr) => {
      for (let i = arr.length - 1; i >= 0; i--) {
        if (!arr[i] || arr[i].dead) arr.splice(i, 1);
      }
    };
    filter(this.monsters);
    filter(this.npcs);
    filter(this.summons);
    filter(this.projectiles);
    filter(this.drops);
  }

  // ===== 渲染 =====

  /**
   * 渲染场景：
   * 1. 地面层（由 IsometricMap 绘制，已做视口剔除）
   * 2. 收集所有 sprite（实体 + 物体层瓦片）按世界 Y 排序后绘制
   *    实体做视口剔除：仅包装/绘制屏幕可见范围内的实体，减少 sortY 与 draw 调用
   * @param {CanvasRenderingContext2D} ctx
   * @param {import('./Camera.js').Camera} camera
   * @param {import('./AssetLoader.js').AssetLoader} assetLoader
   */
  render(ctx, camera, assetLoader) {
    // 1. 地面层（render 同时返回物体层 sprite 列表）
    const objectSprites = this.map.render(ctx, camera, assetLoader);

    // 2. 收集实体 sprite（视口剔除）
    const sprites = [];
    // 复用物体层 sprite，避免重新分配（物体层已在 IsometricMap 内剔除）
    for (const s of objectSprites) sprites.push(s);

    // 玩家（始终保留，避免跟随主体闪烁）
    if (this.player) sprites.push(this._wrapEntity(this.player, camera));
    // 召唤物
    for (const s of this.summons) {
      if (this._isEntityVisible(s, camera)) sprites.push(this._wrapEntity(s, camera));
    }
    // NPC
    for (const n of this.npcs) {
      if (this._isEntityVisible(n, camera)) sprites.push(this._wrapEntity(n, camera));
    }
    // 怪物
    for (const m of this.monsters) {
      if (this._isEntityVisible(m, camera)) sprites.push(this._wrapEntity(m, camera));
    }
    // 掉落物
    for (const d of this.drops) {
      if (this._isEntityVisible(d, camera)) sprites.push(this._wrapEntity(d, camera));
    }
    // 投射物：通常不需 Y 排序（飞行中），但为简单起见也参与排序
    for (const p of this.projectiles) {
      if (this._isEntityVisible(p, camera)) sprites.push(this._wrapEntity(p, camera));
    }

    // 3. 按 sortY 升序排序（世界 Y 越小越靠后绘制，越大越靠前 → 正确遮挡）
    sprites.sort((a, b) => a.sortY - b.sortY);

    // 4. 依次绘制
    for (const sp of sprites) {
      if (sp && typeof sp.draw === 'function') sp.draw(ctx);
    }
  }

  /**
   * 实体视口剔除：判断实体世界坐标是否落在相机视口内（含边距）
   * 边距用于容纳精灵高度（树/建筑可达 96px）、头顶名字与血条、阴影
   * @param {object} entity 实体（需有 worldX/worldY 或 x/y）
   * @param {import('./Camera.js').Camera} camera
   * @returns {boolean} true 表示在视口内，需绘制
   */
  _isEntityVisible(entity, camera) {
    if (!entity) return false;
    const ex = entity.worldX != null ? entity.worldX : (entity.x || 0);
    const ey = entity.worldY != null ? entity.worldY : (entity.y || 0);
    const s = camera.worldToScreen(ex, ey);
    // 边距：左右各 1 个瓦片宽（64），上方留出精灵高度+名字+血条（160），下方 1 个瓦片高（32）
    const marginX = 64;
    const marginYTop = 160;
    const marginYBottom = 32;
    if (s.x < -marginX || s.x > camera.viewportW + marginX) return false;
    if (s.y < -marginYTop || s.y > camera.viewportH + marginYBottom) return false;
    return true;
  }

  /**
   * 把实体包装成统一 sprite 描述 {sortY, draw}
   * - 若实体自带 getSprite(camera) 方法，则直接使用
   * - 否则用默认逻辑：阴影 + 精灵图 + 名字 + 血条
   *   实体需提供 worldX/worldY（世界像素坐标）
   */
  _wrapEntity(entity, camera) {
    if (!entity) return null;

    // 实体自定义 sprite 描述
    if (typeof entity.getSprite === 'function') {
      const sp = entity.getSprite(camera);
      if (sp) return sp;
    }

    const ex = entity.worldX != null ? entity.worldX : (entity.x || 0);
    const ey = entity.worldY != null ? entity.worldY : (entity.y || 0);

    return {
      sortY: ey,
      draw: (ctx) => this._drawEntityDefault(ctx, camera, entity, ex, ey),
    };
  }

  /**
   * 默认实体绘制：阴影 + 精灵 + 名字 + 血条
   * 实体可选字段：
   *  - sprite / image：精灵图
   *  - name / nameColor：头顶名字
   *  - hpRatio：血条比例（0~1）
   *  - shadowRadius：阴影半径（默认 14）
   *  - alpha / scale / anchorX / anchorY：透传给 drawSprite
   */
  _drawEntityDefault(ctx, camera, entity, ex, ey) {
    const shadowRadius = entity.shadowRadius != null ? entity.shadowRadius : 14;
    SpriteRenderer.drawShadow(ctx, camera, ex, ey, shadowRadius);

    const img = entity.sprite || entity.image;
    if (img) {
      SpriteRenderer.drawSprite(ctx, camera, img, ex, ey, {
        anchorX: entity.anchorX != null ? entity.anchorX : 0.5,
        anchorY: entity.anchorY != null ? entity.anchorY : 1.0,
        scale: entity.scale != null ? entity.scale : 1,
        alpha: entity.alpha != null ? entity.alpha : 1,
        frame: entity.frame || null,
      });
    }

    if (entity.name) {
      SpriteRenderer.drawNameTag(
        ctx, camera, ex, ey, entity.name,
        entity.nameColor || '#ffe9a8'
      );
    }

    if (entity.hpRatio != null && entity.hpRatio < 1) {
      SpriteRenderer.drawHealthBar(ctx, camera, ex, ey, entity.hpRatio);
    } else if (entity.hpRatio != null && entity.showFullHpBar) {
      SpriteRenderer.drawHealthBar(ctx, camera, ex, ey, entity.hpRatio);
    }
  }
}

export default Scene;
