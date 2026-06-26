# assets 资源目录

本目录存放《热血传奇 1:1 复刻》游戏的全部美术与数据资源。

## 目录结构

```
assets/
├── sprites/   # 精灵图（角色、怪物、NPC、特效、UI 等）
└── tiles/     # 瓦片图（地图地面、遮挡物等）
```

## 资源约定

### 精灵图（sprites/）
- 格式：PNG（带透明通道）
- 每个精灵图文件配套一个**同名 JSON**，描述帧信息（帧尺寸、帧数、动画序列、锚点/脚底偏移等）
  - 例如：`player_warrior.png` + `player_warrior.json`
- 详细 JSON Schema 与帧描述规范将在 **Task 21** 中统一约定，届时补充本说明。

### 瓦片（tiles/）
- 格式：PNG
- 瓦片尺寸：**64 × 32 像素**（等距视角 isometric 菱形瓦片）
- 宽高比 2:1，符合经典等距渲染规范

## 占位说明

当前为骨架阶段，目录内仅有 `.gitkeep` 占位。
运行时由 `js/engine/AssetLoader.js` 的 `generatePlaceholderImage()` 动态生成纯色精灵，
无需任何外部资源即可启动。后续 Task 接入真实资源后，将对应清单填入
`main.js` 的 `manifest` 中。
