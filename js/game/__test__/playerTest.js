/**
 * playerTest.js — 玩家角色实体自测入口
 *
 * 用法（在 main.js 的 PLAYING 状态临时挂载）：
 *   import { runPlayerTest } from './game/__test__/playerTest.js';
 *   const stop = runPlayerTest(canvas, assetLoader);
 *   // 卸载时调用 stop() 释放输入监听
 *
 * 行为：
 * - 创建 Player('warrior', '测试战士', BICICHENG_MAP)，给 1000 金币与 5 瓶小红药
 * - 创建 IsometricMap(BICICHENG_MAP) 与 follow 玩家的 Camera
 * - 左键点击空地：调用 player.setDestination(targetTx, targetTy, map) 寻路移动
 * - WASD：每次按下沿等距方向设定一格路径（直接移动）
 * - update：调用 player.update(dt, input, game)；相机跟随玩家
 * - render：绘制地图 + 阴影 / 精灵 / 名字 / 血条；HUD 显示等级/HP/MP/经验/金币
 * - 返回 stop() 卸载监听并停止循环
 */

import { Player } from '../Player.js';
import { IsometricMap } from '../../engine/IsometricMap.js';
import { Camera } from '../../engine/Camera.js';
import { Input } from '../../engine/Input.js';
import { SpriteRenderer } from '../../engine/SpriteRenderer.js';
import { BICICHENG_MAP } from '../../data/maps/bicicheng.js';

/**
 * 启动玩家自测
 * @param {HTMLCanvasElement} canvas
 * @param {import('../../engine/AssetLoader.js').AssetLoader} assetLoader
 * @returns {() => void} 停止函数
 */
export function runPlayerTest(canvas, assetLoader) {
  const ctx = canvas.getContext('2d');

  // 1. 地图（IsometricMap 实例，用于寻路与渲染）
  const map = new IsometricMap(BICICHENG_MAP);

  // 2. 玩家：从地图 playerStart 生成
  const player = new Player('warrior', '测试战士', BICICHENG_MAP);
  player.gold = 1000;
  player.inventory.addItem('hp_potion_small', 5);

  // 3. 相机：视口用 CSS 像素，限制在地图世界包围盒内
  const camera = new Camera(window.innerWidth, window.innerHeight);
  const b = map.worldBounds;
  camera.clamp(b.minX, b.minY, b.maxX, b.maxY);
  camera.setCenter(player.wx, player.wy);

  // 4. 输入
  const input = new Input(canvas);

  // 5. 游戏上下文（传给 player.update，供后续战斗系统使用）
  const game = { map, camera, player, input };

  // 6. 简易帧循环
  let running = true;
  let lastTime = performance.now();
  let fps = 0;
  let frameCount = 0;
  let fpsTime = lastTime;
  let rafId = 0;

  const handleResize = () => {
    camera.setViewport(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', handleResize);

  // WASD -> 等距方向相邻瓦片（W=北上 S=南下 A=西左 D=东右）
  const wasdNeighbor = (code, p) => {
    switch (code) {
      case 'KeyW': case 'ArrowUp':    return { tx: p.tx - 1, ty: p.ty - 1 };
      case 'KeyS': case 'ArrowDown':  return { tx: p.tx + 1, ty: p.ty + 1 };
      case 'KeyA': case 'ArrowLeft':  return { tx: p.tx - 1, ty: p.ty + 1 };
      case 'KeyD': case 'ArrowRight': return { tx: p.tx + 1, ty: p.ty - 1 };
      default: return null;
    }
  };

  const update = (dt) => {
    // 把鼠标屏幕坐标转世界坐标回写，便于交互读取
    const m = input.getMouse();
    const wpos = camera.screenToWorld(m.x, m.y);
    m.worldX = wpos.x;
    m.worldY = wpos.y;

    // 左键点击空地 -> 寻路
    if (input.mouse.leftPressed) {
      const tile = map.worldToTile(wpos.x, wpos.y);
      player.setDestination(Math.floor(tile.tx), Math.floor(tile.ty), map);
    }

    // WASD 每次按下设定一格路径
    for (const code of ['KeyW', 'KeyS', 'KeyA', 'KeyD',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      if (input.wasKeyJustPressed(code)) {
        const n = wasdNeighbor(code, player);
        if (n && map.isWalkable(n.tx, n.ty)) {
          player.setDestination(n.tx, n.ty, map);
        }
        break;
      }
    }

    // 玩家状态机更新
    player.update(dt, input, game);

    // 相机跟随玩家
    camera.follow({ x: player.wx, y: player.wy }, 0.12);

    // 每帧末尾重置输入瞬时状态
    input.update();
  };

  const render = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // 清屏
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    // 绘制地图（地面层 + 物体层 sprite 收集）
    const sprites = map.render(ctx, camera, assetLoader);

    // 把玩家 sprite 加入 Y 排序
    const info = player.getRenderInfo();
    sprites.push({
      sortY: info.worldY,
      draw(ctx2) {
        // 阴影
        SpriteRenderer.drawShadow(ctx2, camera, info.worldX, info.worldY, 14);
        // 精灵：有占位图用图，否则用职业色块占位
        const img = (assetLoader && assetLoader.getImage && assetLoader.getImage('player_warrior')) || null;
        if (img) {
          SpriteRenderer.drawSprite(ctx2, camera, img, info.worldX, info.worldY, {
            anchorX: 0.5,
            anchorY: 1.0,
          });
        } else {
          const s = camera.worldToScreen(info.worldX, info.worldY);
          ctx2.fillStyle = info.sprite.color;
          ctx2.fillRect(s.x - 12, s.y - 40, 24, 40);
          ctx2.strokeStyle = '#ffe9a8';
          ctx2.lineWidth = 1;
          ctx2.strokeRect(s.x - 12, s.y - 40, 24, 40);
        }
        // 头顶名字 + 血条
        SpriteRenderer.drawNameTag(
          ctx2, camera, info.worldX, info.worldY,
          `${info.name} Lv${info.level}`, info.nameColor
        );
        SpriteRenderer.drawHealthBar(ctx2, camera, info.worldX, info.worldY, info.hpRatio);
      },
    });

    // 物体层与玩家统一 Y 排序绘制
    sprites.sort((a, b) => a.sortY - b.sortY);
    for (const s of sprites) {
      if (s && typeof s.draw === 'function') s.draw(ctx);
    }

    // HUD：等级 / HP / MP / 经验 / 金币 / 坐标
    ctx.save();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '14px "Microsoft YaHei", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`等级 ${player.level}`, 10, 10);
    ctx.fillText(`HP ${Math.ceil(player.stats.hp)}/${player.stats.maxHp}`, 10, 30);
    ctx.fillText(`MP ${Math.ceil(player.stats.mp)}/${player.stats.maxMp}`, 10, 50);
    ctx.fillText(`EXP ${player.exp}/${player.getExpToNext()}`, 10, 70);
    ctx.fillText(`金币 ${player.gold}`, 10, 90);
    ctx.fillText(`瓦片 (${player.tx}, ${player.ty})`, 10, 110);
    ctx.fillText(`FPS ${fps}`, 10, 130);
    ctx.fillText(`左键寻路 / WASD 移动`, 10, 150);
    ctx.restore();
  };

  const tick = (now) => {
    if (!running) return;
    let frameTime = now - lastTime;
    lastTime = now;
    if (frameTime > 250) frameTime = 250; // 防止切后台后大跳
    const dt = frameTime / 1000;
    update(dt);
    render();

    frameCount++;
    if (now - fpsTime >= 1000) {
      fps = frameCount;
      frameCount = 0;
      fpsTime = now;
    }
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  // 返回停止函数
  return () => {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener('resize', handleResize);
    input.detach();
  };
}

export default runPlayerTest;
