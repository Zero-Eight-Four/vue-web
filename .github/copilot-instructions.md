## 快速概览 — 目标与边界

这是一个用于连接 ROS（通过 rosbridge）并在浏览器中可视化与编辑地图/相机/导航数据的前端仪表盘。前端基于 Vue 3 + Vite，3D 可视化用 Three.js，ROS 通信使用 `roslib`。后端并不在仓库中：开发时 Vite 提供一个本地 middleware（见 `vite.config.js`）来暴露地图文件的 HTTP 接口。

## 关键启动 / 调试 命令（项目特定）

- 安装依赖：
  - Windows (cmd.exe):
    set PGM_DIR=D:\maps
    npm install
    npm run dev
  - 默认 dev 地址： http://localhost:5173
- 必须先在 ROS 端启动 rosbridge_server（默认 WebSocket 9090）：
  roslaunch rosbridge_server rosbridge_websocket.launch

如果需要改变本地地图目录，设置环境变量 `PGM_DIR`（Vite 中会解析）。在 cmd.exe 中先用 `set PGM_DIR=...` 再运行 `npm run dev`。

## 重要文件与意图（修改/调试时优先查看）

- `src/App.vue` — 应用入口、rosbridge 连接逻辑、面板切换与快速发布按钮的配置（publisher presets、默认 ws url）。修改默认 WS 地址或新增面板首选在此处进行。
- `src/components/View3D.vue` — Three.js 场景与 ROS 订阅（/path, /map, /points），使用 `ROSLIB.TFClient`、`nav_msgs/Path`、`nav_msgs/OccupancyGrid` 与 `sensor_msgs/PointCloud2`。主要交互、相机控制均在此文件实现。
- `src/components/CameraViewer.vue` — 订阅 `sensor_msgs/Image`，支持 jpeg/png 和 rgb8/bgr8 解码成 data URL。注意大图像的 base64/Canvas 解码可能造成内存压力。
- `src/components/MapEditor.vue` — PGM（P5/P2）解析/编辑/生成与上传（使用 `/api/maps` via vite middleware），并通过 rosbridge 发布 Base64 PGM 到 `/map_editor/pgm_data`。PGM 读写逻辑（parse/build）在本文件，修改 PGM 行为时请在此处调整。
- `vite.config.js` — 包含一个 dev-server middleware：暴露 `GET /api/maps`, `GET /api/maps/{name}`, `PUT /api/maps/{name}`，以及基于 `PGM_DIR` 的目录解析。任何与地图文件 I/O 有关的变更通常要同步此文件。
- `maps/` — 默认的地图文件目录（可由 `PGM_DIR` 覆盖）。

## 项目约定与常见模式（供 AI 参考）

- ROS 连接模型：一处创建 `ROSLIB.Ros` 对象（`src/App.vue`），组件通过 props 接收 `ros` 与 `connected`，并在内部创建/销毁 `ROSLIB.Topic` 或 `ROSLIB.TFClient`。遵循 subscribe/ unsubscribe 的生命周期（onMounted/onBeforeUnmount / watch connected）。
- 快捷发布（publisher presets）：一律使用 `std_msgs/Empty` 作为默认快速命令类型（见 `src/App.vue` 的 publisherPresets）。新增预设时保留同样的数据形态与短超时 UI 行为。
- MapEditor 使用 P5/P2 文本或二进制 PGM 格式读取，并将像素数据保存在 Uint8Array/Uint8ClampedArray 中；生成上传时以 `application/octet-stream` PUT 到 `/api/maps/{name}`。不要在 middleware 里假定额外元数据。

## 集成点与外部依赖

- rosbridge_server（WebSocket, 默认 9090）— 必备：前端通过 `roslib` 与其通信。
- Three.js（渲染）、roslib（ROS 通信）、Vite（dev server + middleware）。
- 地图文件通过 Vite middleware 暴露给前端（`vite.config.js`）。地图的默认目录为仓库的 `maps/`，生产环境需确保 Node 侧或部署平台提供相同的接口。

## 代码修改建议（常见任务示例）

- 更改默认 ROS topic/URL：修改 `src/App.vue` 中的 `wsUrl` 或 `panelTopics` / `publisherPresets`。
- 增加新的 3D 订阅或渲染层：在 `src/components/View3D.vue` 添加新的 `ROSLIB.Topic` 订阅并将数据转换为 Three.js 对象；确保在组件卸载或 `connected` 变更时 unsubscribe 并 dispose 资源。
- 支持新的 PGM 子格式或更大文件：修改 `src/components/MapEditor.vue` 的 `parsePgmBuffer` 与 `buildPgmBuffer`，并注意浏览器内存与 base64 编码成本（发送前可考虑分片或压缩）。

## 已发现的可用示例（直接引用）

- 发布 PGM 到 robot: MapEditor 调用 topic `/map_editor/pgm_data` 发送 JSON `{ name, encoding: 'base64', data }`（`std_msgs/String`）。
- 默认 Camera topic：`/camera/image_raw`（可在 `CameraViewer.vue` 的 `topicName` prop 修改）。
- Vite maps API: `GET /api/maps` 列表、`GET /api/maps/{name}` 下载、`PUT /api/maps/{name}` 上传（参见 `vite.config.js` 中的 `registerMapsApi`）。

## 何时回退/寻求人工帮助

- 若需要变更后端接口（非 Vite middleware），请先确认生产部署是否也会提供相同的 `/api/maps` 接口。
- 对于大型点云或高帧率图像流，若观察到性能或内存问题，需人工介入优化数据管道（例如降采样、流控或服务器端转码）。

请阅读本说明并告诉我是否需要把某个常见任务（例如“如何添加新 topic 的端到端示例”或“如何在生产环境替换 vite 的 maps middleware”）写成更详细的步骤。
