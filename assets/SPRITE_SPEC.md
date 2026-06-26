# 精灵图资源规范

## 瓦片
- 尺寸：64×32 像素（等距 2:1）
- 格式：PNG，透明背景
- 命名：tiles/{tileId}.png（如 tiles/1.png = 草地）
- 对应 js/data/tiles.js 的 TILE 常量

## 角色精灵
- 尺寸：48×64 像素（站立帧）
- 8 方向 × 4 动作（idle/walk/attack/cast）× 多帧
- 帧数：idle 4 帧、walk 6 帧、attack 4 帧、cast 6 帧
- 帧布局：精灵图横向排列，每帧 48×64
- 配套 JSON：sprites/{entityId}.json
  ```json
  {
    "id": "player_warrior",
    "frameWidth": 48,
    "frameHeight": 64,
    "animations": {
      "idle_down": {"start": 0, "frames": 4, "fps": 6},
      "walk_down": {"start": 4, "frames": 6, "fps": 10},
      "..."
    }
  }
  ```

## 怪物精灵
- 尺寸：按 size 字段缩放（基础 48×64）
- 4 方向（下/左/右/上）× 3 动作（idle/walk/attack）
- 命名：sprites/monster_{monsterId}.png + .json

## 物品图标
- 尺寸：32×32 像素
- 命名：icons/{itemId}.png

## UI 图标
- 技能图标：32×32，icons/skill_{skillId}.png
- HP/MP 球贴图：80×80，ui/hp_orb.png / ui/mp_orb.png

## 替换流程
1. 在 assets/ 对应目录放入 PNG 和 JSON
2. 修改 js/main.js 的 _preloadAssets() 中的 manifest，添加资源
3. AssetLoader.preload 会自动加载
4. 各渲染模块通过 assets.getImage(key) 获取

## 代码接口
- 精灵图帧管理：`js/engine/SpriteSheet.js`
  - `new SpriteSheet(image, frameWidth, frameHeight, animations)`
  - `getFrame(animationName, frameIndex)` → `{sx, sy, sw, sh}`
  - `getAnimatedFrame(animationName, time)` → 按 fps 自动取当前帧（time 单位：秒）
- 资源加载：`js/engine/AssetLoader.js`
  - `loadSpriteSheet(key, imgSrc, jsonSrc)` → 成对加载 PNG + JSON，构造并缓存 SpriteSheet
  - `getSpriteSheet(key)` → 取已加载的 SpriteSheet 实例
  - JSON 字段约定：`frameWidth` / `frameHeight` / `animations.{name}.{start,frames,fps}`
- 瓦片 / 图标：仍通过 `assets.getImage(key)` 取单张 PNG（key 形如 `tile_${tileId}`、`icon_${itemId}`）

## 动画命名约定
- 角色 8 方向：`_down` / `_leftdown` / `_left` / `_leftup` / `_up` / `_rightup` / `_right` / `_rightdown`
- 4 动作前缀：`idle` / `walk` / `attack` / `cast`
- 组合示例：`idle_down`、`walk_leftup`、`attack_right`、`cast_up`
- 怪物 4 方向：`_down` / `_left` / `_right` / `_up`；3 动作：`idle` / `walk` / `attack`

