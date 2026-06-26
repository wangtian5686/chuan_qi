/**
 * maptest.js — 等距地图渲染引擎自测入口
 *
 * 用法（在后续集成任务中临时挂载到 main.js 的 PLAYING 状态）：
 *   import { runMapTest } from './engine/__test__/maptest.js';
 *   const stop = runMapTest(canvas, assetLoader);
 *   // 卸载时调用 stop() 释放输入监听
 *
 * 行为：
 * - 创建 IsometricMap(TEST_MAP)
 * - 创建 Camera 并 follow 一个虚拟玩家（{x,y} 世界像素坐标）
 * - update：根据 WASD 移动虚拟玩家（按世界像素 8 方向移动，速度恒定）
 * - render：清屏后绘制地图；右上角显示 FPS 与玩家所在瓦片坐标
 * - 鼠标点击地图：演示 A* 寻路，打印路径到控制台
 *
 * 本文件仅用于本任务自测，不接入正式流程。
 */

import { IsometricMap } from '../IsometricMap.js';
import { Camera } from '../Camera.js';
import { Input } from '../Input.js';
import { Pathfinder } from '../Pathfinder.js';
import { TEST_MAP } from '../../data/maps/test.js';

/**
 * 启动地图自测
 * @param {HTMLCanvasElement} canvas
 * @param {import('../AssetLoader.js').AssetLoader} assetLoader
 * @returns {() => void} 停止函数（卸载监听并停止循环）
 */
export function runMapTest(canvas, assetLoader) {
  const ctx = canvas.getContext('2d');

  // 1. 地图
  const map = new IsometricMap(TEST_MAP);

  // 2. 相机：视口用 CSS 像素尺寸
  const camera = new Camera(window.innerWidth, window.innerHeight);
  // 限制相机中心在地图世界包围盒内
  const b = map.worldBounds;
  camera.clamp(b.minX, b.minY, b.maxX, b.maxY);

  // 3. 虚拟玩家：从 playerStart 瓦片转到世界像素坐标
  const startWorld = map.tileToWorld(map.playerStart.x, map.playerStart.y);
  const player = { x: startWorld.wx, y: startWorld.wy };

  // 初始把相机对准玩家
  camera.setCenter(player.x, player.y);

  // 4. 输入
  const input = new Input(canvas);

  // 5. 简易帧循环（与 GameLoop 解耦，便于独立测试）
  let running = true;
  let lastTime = performance.now();
  let fps = 0;
  let frameCount = 0;
  let fpsTime = lastTime;
  let rafId = 0;

  const PLAYER_SPEED = 180; // 像素/秒

  const handleResize = () => {
    camera.setViewport(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', handleResize);

  const update = (dt) => {
    // WASD 移动（8 方向）
    let dx = 0, dy = 0;
    if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) dy -= 1;
    if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) dy += 1;
    if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) dx -= 1;
    if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) dx += 1;

    if (dx !== 0 || dy !== 0) {
      // 归一化，避免对角线移动更快
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
      player.x += dx * PLAYER_SPEED * dt;
      player.y += dy * PLAYER_SPEED * dt;
    }

    // 鼠标点击：演示寻路
    if (input.mouse.leftPressed) {
      const world = camera.screenToWorld(input.mouse.x, input.mouse.y);
      const endTile = map.worldToTile(world.x, world.y);
      const startTile = map.worldToTile(player.x, player.y);
      const path = Pathfinder.findPath(map, startTile, endTile);
      if (path) {
        const simple = Pathfinder.simplifyPath(path);
        console.log('[maptest] 寻路成功：', path.length, '步；简化后', simple.length, '步', simple);
      } else {
        console.log('[maptest] 寻路失败（不可达或目标阻挡）');
      }
    }

    // 相机跟随玩家
    camera.follow(player, 0.12);

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

    // 物体层按 Y 排序绘制
    sprites.sort((a, b) => a.sortY - b.sortY);
    for (const s of sprites) {
      if (s && typeof s.draw === 'function') s.draw(ctx);
    }

    // 绘制虚拟玩家：阴影 + 红色方块占位
    const ps = camera.worldToScreen(player.x, player.y);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(ps.x, ps.y, 14, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c83020';
    ctx.fillRect(ps.x - 12, ps.y - 40, 24, 40);
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 1;
    ctx.strokeRect(ps.x - 12, ps.y - 40, 24, 40);
    ctx.restore();

    // 安全区多边形可视化（连线 + 半透明填充）
    if (map.safeZone && map.safeZone.length >= 3) {
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < map.safeZone.length; i++) {
        const [tx, ty] = map.safeZone[i];
        const wp = map.tileToWorld(tx, ty);
        const sp = camera.worldToScreen(wp.wx, wp.wy);
        if (i === 0) ctx.moveTo(sp.x, sp.y);
        else ctx.lineTo(sp.x, sp.y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(80,180,255,0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,200,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // 调试信息
    const tile = map.worldToTile(player.x, player.y);
    const inSafe = map.isInSafeZone(Math.floor(tile.tx), Math.floor(tile.ty));
    ctx.fillStyle = '#7f8c6a';
    ctx.font = '13px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`FPS ${fps}`, 10, 10);
    ctx.fillText(`瓦片 (${Math.floor(tile.tx)}, ${Math.floor(tile.ty)})`, 10, 28);
    ctx.fillText(`安全区: ${inSafe ? '是' : '否'}`, 10, 46);
    ctx.fillText(`WASD 移动 / 左键点击寻路`, 10, 64);
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

export default runMapTest;
