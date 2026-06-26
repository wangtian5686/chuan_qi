# Tasks

## 阶段一：项目骨架与渲染引擎
- [ ] Task 1: 搭建项目骨架：创建 `index.html`、目录结构（`js/engine`、`js/game`、`js/ui`、`js/data`、`js/save`、`assets`）、`main.js` 启动入口与游戏主循环（fixed timestep 更新 + requestAnimationFrame 渲染）。
  - [ ] SubTask 1.1: 创建 `index.html`，包含 Canvas 容器与全屏样式
  - [ ] SubTask 1.2: 创建 `js/engine/GameLoop.js`，实现 update/render 循环与帧率统计
  - [ ] SubTask 1.3: 创建 `js/engine/AssetLoader.js`，实现图片/JSON 资源预加载与回调
- [ ] Task 2: 实现等距瓦片地图渲染引擎。
  - [ ] SubTask 2.1: 创建 `js/engine/IsometricMap.js`，瓦片坐标↔屏幕坐标转换、瓦片层绘制
  - [ ] SubTask 2.2: 实现相机跟随玩家、平滑滚屏、地图边缘黑边裁剪
  - [ ] SubTask 2.3: 实现精灵 Y 排序绘制，保证遮挡正确
  - [ ] SubTask 2.4: 加载地图数据格式（瓦片 ID 二维数组 + 遮挡层 + 传送点 + 安全区多边形）
- [ ] Task 3: 实现输入系统（鼠标左/右键、键盘事件、按键映射表）。
  - [ ] SubTask 3.1: 创建 `js/engine/Input.js`，统一鼠标/键盘状态查询
  - [ ] SubTask 3.2: 屏幕坐标→世界瓦片坐标的反向转换

## 阶段二：角色与职业
- [ ] Task 4: 创建职业、技能、属性成长配置表。
  - [ ] SubTask 4.1: `js/data/classes.js` — 战士/法师/道士初始属性、每级 HP/MP/攻防成长
  - [ ] SubTask 4.2: `js/data/skills.js` — 全部技能定义（伤害公式、MP 消耗、冷却、射程、学习等级）
  - [ ] SubTask 4.3: `js/data/items.js` — 起始装备与经典装备（屠龙刀、麻戒、骨玉、龙纹剑、圣战套等）
- [ ] Task 5: 实现角色实体（Player）。
  - [ ] SubTask 5.1: `js/game/Player.js` — 属性、状态机（站立/移动/攻击/施法/死亡）、八方向朝向
  - [ ] SubTask 5.2: 实现 A* 寻路与平滑移动
  - [ ] SubTask 5.3: 实现属性聚合（基础 + 装备 + buff）
- [ ] Task 6: 实现技能系统。
  - [ ] SubTask 6.1: `js/game/SkillSystem.js` — 技能学习、快捷栏绑定、冷却、MP 检查
  - [ ] SubTask 6.2: 实现各技能效果（近战连击、远程投射物、AOE、召唤、buff、debuff）
  - [ ] SubTask 6.3: 投射物与 AOE 命中判定

## 阶段三：怪物与战斗
- [ ] Task 7: 创建怪物与掉落配置表。
  - [ ] SubTask 7.1: `js/data/monsters.js` — 经典怪物（多钩猫、钉耙猫、沃玛战士、祖玛雕像、月魔蜘蛛、血巨人等）及 BOSS（沃玛教主、祖玛教主、赤月恶魔）
  - [ ] SubTask 7.2: `js/data/drops.js` — 各怪物掉落概率表
- [ ] Task 8: 实现怪物 AI。
  - [ ] SubTask 8.1: `js/game/Monster.js` — 状态机（巡逻/追击/攻击/死亡/掉落）
  - [ ] SubTask 8.2: 视野检测、仇恨范围、脱战回血
  - [ ] SubTask 8.3: 怪物刷新管理器（按地图配置定时定点刷新）
- [ ] Task 9: 实现战斗结算。
  - [ ] SubTask 9.1: 命中/闪避/暴击/幸运诅咒判定公式
  - [ ] SubTask 9.2: 伤害数字飘字、受击红闪、死亡动画
  - [ ] SubTask 9.3: 经验分配、金币/物品掉落、地面掉落物拾取

## 阶段四：地图与世界
- [ ] Task 10: 创建五张主地图数据。
  - [ ] SubTask 10.1: 比奇城（安全区、NPC、传送点）
  - [ ] SubTask 10.2: 盟重省（野外怪、连接沃玛/祖玛入口）
  - [ ] SubTask 10.3: 沃玛寺庙（多层副本、底层 BOSS）
  - [ ] SubTask 10.4: 祖玛阁（迷宫式副本、祖玛教主）
  - [ ] SubTask 10.5: 赤月峡谷（高难本、赤月恶魔）
- [ ] Task 11: 实现地图切换与传送系统。
  - [ ] SubTask 11.1: 传送光圈触发器、传送 NPC 对话
  - [ ] SubTask 11.2: 切图加载流程（卸载旧地图资源 → 加载新地图 → 角色置位）
- [ ] Task 12: 实现 NPC 系统。
  - [ ] SubTask 12.1: `js/game/Npc.js` — 站立、对话触发、商店面板
  - [ ] SubTask 12.2: 商店买卖逻辑、铁匠修理、回城卷轴购买
  - [ ] SubTask 12.3: 大刀卫士（攻击红名玩家）

## 阶段五：装备、背包、PK
- [ ] Task 13: 实现背包与装备系统。
  - [ ] SubTask 13.1: `js/game/Inventory.js` — 24 格背包、堆叠、移动、丢弃
  - [ ] SubTask 13.2: 装备槽（武器/衣服/头盔/项链/双戒/双手镯/腰带/靴子）、穿戴/卸下、属性重算
  - [ ] SubTask 13.3: 装备耐久度、战斗损耗、损坏失效、修理恢复
- [ ] Task 14: 实现 PK 与红名系统。
  - [ ] SubTask 14.1: PK 值累计、红名阈值、名字颜色渲染
  - [ ] SubTask 14.2: 安全区 PK 禁止、红名进城被大刀卫士追杀
  - [ ] SubTask 14.3: PK 值在线衰减、赎罪药水

## 阶段六：UI 与存档
- [ ] Task 15: 实现 HUD 与窗口 UI。
  - [ ] SubTask 15.1: 顶部 HP/MP 球、经验条、小地图
  - [ ] SubTask 15.2: 底部技能栏 F1-F8、技能拖拽绑定
  - [ ] SubTask 15.3: 背包窗口、角色面板、商店面板、对话框
- [ ] Task 16: 实现快捷键映射（B 背包、C 角色、V 技能、F1-F8 技能、回车聊天）。
- [ ] Task 17: 实现存档系统。
  - [ ] SubTask 17.1: `js/save/SaveManager.js` — localStorage 序列化/反序列化
  - [ ] SubTask 17.2: 自动存档（切图触发 + 每 60 秒）、手动存档、读档、存档槽
- [ ] Task 18: 实现主菜单（新游戏/继续游戏/选择职业/设置）。

## 阶段七：联调与打磨
- [ ] Task 19: 角色创建→出生→打怪→升级→穿戴装备→进副本→击杀 BOSS 全流程联调。
- [ ] Task 20: 性能优化（精灵合图、视口剔除、对象池）。
- [ ] Task 21: 占位美术资源替换说明与可扩展接口（精灵图 JSON 格式约定）。

# Task Dependencies
- Task 2 依赖 Task 1
- Task 3 依赖 Task 2
- Task 5 依赖 Task 4
- Task 6 依赖 Task 5
- Task 7 可与 Task 4 并行
- Task 8 依赖 Task 5、Task 7
- Task 9 依赖 Task 6、Task 8
- Task 10 可与 Task 5 并行
- Task 11 依赖 Task 2、Task 10
- Task 12 依赖 Task 11、Task 13
- Task 13 可与 Task 8 并行
- Task 14 依赖 Task 9、Task 12
- Task 15 依赖 Task 5、Task 13
- Task 16 依赖 Task 15
- Task 17 可与 Task 15 并行
- Task 18 依赖 Task 17
- Task 19 依赖 Task 14、Task 16、Task 18
- Task 20、Task 21 依赖 Task 19
