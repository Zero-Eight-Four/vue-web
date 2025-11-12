## 快速概览 — 目标与边界

ROS 仪表盘：Vue 3 + Vite 前端，连接 rosbridge WebSocket，可视化导航、摄像头、点云数据，实时编辑 PGM 地图。三大视图面板可切换，右侧预设按钮快速发布 ROS 消息。后端非同仓库，Vite dev 提供地图文件 HTTP API（`/api/maps`）。

## 关键启动 / 调试 命令

```bash
# Windows cmd.exe
set PGM_DIR=D:\maps
npm install
npm run dev
# 访问 http://localhost:5173
```

**必备**：ROS 端需启动 rosbridge_server（WebSocket 9090）
```bash
roslaunch rosbridge_server rosbridge_websocket.launch
```

**自定义地图目录**：通过 `PGM_DIR` 环境变量改变地图路径（Vite 会解析）。

## 重要文件与组件架构

### 核心连接与主应用
- **`src/App.vue`**（~1000 行）
  - 单一 ROSLIB.Ros 对象（全局）创建于 `connect()` 方法，通过 props 传递给子组件
  - 三个面板：navigation / camera / map-editor，通过 `activePanel` 切换
  - 预设发布器（`publisherPresets`）按面板分类，统一使用 `std_msgs/Empty`，发布后 400ms 清除发布状态
  - 订阅列表（`panelTopics`）仅用于 UI 展示，实际订阅在各组件内部完成
  - 连接状态机：disconnected → connecting → connected/error，错误时保留 `statusDetail` 信息

### 数据流与订阅模式
- **`src/components/View3D.vue`**（~330 行）
  - Three.js 场景初始化与鼠标控制（左键旋转、右键平移、滚轮缩放）
  - 内部创建三个 ROSLIB.Topic 订阅：`/path`（nav_msgs/Path）、`/map`（nav_msgs/OccupancyGrid）、`/points`（sensor_msgs/PointCloud2）
  - 使用 ROSLIB.TFClient 处理坐标变换
  - 关键：onMounted 时初始化，onBeforeUnmount / watch connected 时 unsubscribe 和 dispose Three.js 资源
  - 点云与路径数据存入 `paths` 和 `pointClouds` ref，实时渲染

- **`src/components/CameraViewer.vue`**（~160 行）
  - 订阅单一话题（默认 `/camera/image_raw`，可通过 `topicName` prop 改）
  - 解码支持：JPEG/PNG（base64）和 RGB8/BGR8（Canvas）
  - 注意：大图像的 base64 编码与 Canvas 操作可能造成内存压力

- **`src/components/MapEditor.vue`**（~1070 行）
  - 本地 canvas 绘图（支持自由绘制/障碍/未知三种工具）
  - HTTP API：`GET /api/maps` 获取列表、`GET /api/maps/{name}` 下载、`PUT /api/maps/{name}` 上传
  - PGM 格式：支持 P5（二进制）和 P2（文本），解析与生成核心逻辑在 `parsePgmBuffer` 和 `buildPgmBuffer`
  - 发布 Base64 PGM 到 `/map_editor/pgm_data`（std_msgs/String）格式：`{ name, encoding: 'base64', data }`

### Vite 配置与后端 API
- **`vite.config.js`**
  - `registerMapsApi()` 中间件：处理 `/api/maps` 路由
  - 地图目录由 `PGM_DIR` 环境变量或默认 `./maps` 决定（`resolveMapsDir()` 解析）
  - 接口：GET 返回 JSON 文件列表（含大小、修改时间），PUT/POST 保存二进制数据
  - 文件名通过 `sanitizeName()` 防护，仅接受 `.pgm` 扩展名

## 项目约定与常见模式

### ROS 连接生命周期
1. App.vue 中的 `connect()` 创建全局 `ROSLIB.Ros({ url })`，注册 `on('connection')` / `on('close')` / `on('error')` 回调
2. 子组件通过 `watch(connected)` 或 `onMounted` 分别创建 ROSLIB.Topic 订阅；通过 props 接收 `ros` 对象和 `connected` 布尔值
3. **关键**：onBeforeUnmount 或 disconnected 时必须 unsubscribe 话题，View3D 还需 dispose Three.js 资源（材质、几何体、渲染器）

### 消息发布与预设按钮
- `publisherPresets` 按 panelId 分类，每个预设含 `label`、`topic`、`type`、`hint`
- 发布时创建短期 Topic → 新建 Message → publish，然后 setTimeout 400ms 清除 UI 状态
- 错误处理：catch 时更新全局 `status` 和 `statusDetail`，UI 显示错误提示

### 画布与地图编辑
- MapEditor 内部维护 canvas 绘图状态：`mode`（pointer/brush）、`tool`（free/occupied/unknown）
- 像素数据存储在 Uint8Array（或 Uint8ClampedArray），三值映射：free=255, occupied=0, unknown=205
- 上传前通过 `buildPgmBuffer()` 将像素数据编码为 PGM 格式，然后 `PUT /api/maps/{name}` 发送二进制

### 三值地图约定
- **255** = 自由空间（白色）
- **0** = 障碍物（黑色）  
- **205** = 未知区域（灰色）
- 其他值：ROS 栅格地图可能包含 -1（未知/闭路），但本项目对外仅暴露三值

## 集成点与外部依赖

- **rosbridge_server**（WebSocket, 默认 9090）：前端通过 ROSLIB 与其通信，必须先启动
- **Three.js**：View3D 的 3D 渲染引擎，需手动管理资源生命周期
- **roslib**：ROS 通信库，提供 Ros、Topic、TFClient 等核心类
- **Vite middleware**：暴露 `/api/maps` HTTP 接口，地图目录由 `PGM_DIR` 或默认 `./maps` 决定
- **生产部署**：若非 Vite 开发，需确保部署平台提供相同的 `/api/maps` 接口和 PGM 文件存储

## 代码修改建议（常见任务示例）

- **更改默认 ROS 地址/topic**：修改 `src/App.vue` 中的 `wsUrl`（当前 `ws://192.168.13.129:9090`）、`panelTopics` 或 `publisherPresets`
- **增加新的 3D 订阅/渲染层**：在 `src/components/View3D.vue` 添加新 `ROSLIB.Topic` 订阅，转换为 Three.js 对象，确保 unsubscribe 和 dispose 资源
- **支持新 PGM 格式/大文件**：修改 `src/components/MapEditor.vue` 的 `parsePgmBuffer` 与 `buildPgmBuffer`，注意浏览器内存与 base64 成本
- **新增预设按钮**：在 `src/App.vue` 的 `publisherPresets[panelId]` 数组中添加对象，含 `label` / `topic` / `type` / `hint`

## 已发现的可用示例

- PGM 上传到机器人：MapEditor 发布到 `/map_editor/pgm_data`（`std_msgs/String`），格式 `{ name, encoding: 'base64', data }`
- 摄像头 topic：默认 `/camera/image_raw`（`CameraViewer.vue` 中 `topicName` prop 可改）
- Vite maps API：`GET /api/maps` 列表、`GET /api/maps/{name}` 下载、`PUT /api/maps/{name}` 上传

## 何时回退/寻求人工帮助

- 若需要变更后端接口（非 Vite middleware），请先确认生产部署是否也会提供相同的 `/api/maps` 接口。
- 对于大型点云或高帧率图像流，若观察到性能或内存问题，需人工介入优化数据管道（例如降采样、流控或服务器端转码）。

请阅读本说明并告诉我是否需要把某个常见任务（例如“如何添加新 topic 的端到端示例”或“如何在生产环境替换 vite 的 maps middleware”）写成更详细的步骤。
