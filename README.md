# vue-web
# ROS Dashboard (Vue 3)

一个现代化的 Web 界面，通过 rosbridge 连接 ROS 系统，提供左侧主视图区域与右侧快捷操作栏的布局，可在 3D 导航视图、摄像头视图与地图编辑器之间快速切换，并通过预设按钮发布常用控制指令。界面设计参考了 Foxglove Studio 和 Lichtblick。

## 功能特性

### 🎯 侧边面板切换
- 左侧主视图可在「3D 导航」与「摄像头」两种模式间切换
- 视图描述与状态提示即时更新
- 未连接时自动显示提示遮罩

### 🗺️ 3D 导航视图
- 实时显示 ROS 导航路径（`/path`）
- 支持占用栅格地图显示（`/map`）
- 点云数据可视化（`/points`）
- 交互式 3D 场景控制（鼠标拖拽旋转、右键平移、滚轮缩放）
- TF 变换支持

### 📷 摄像头视图
- 实时显示来自 ROS 话题的图像数据
- 支持多种图像格式（JPEG、PNG、RGB8、BGR8）
- 自动解码和显示 `sensor_msgs/Image` 消息

### 🗺️ 地图编辑器（PGM）
- 直接读取服务器本地目录（默认 `maps/`，或通过 `PGM_DIR` 环境变量指定）
- 支持选择 P5 / P2 PGM 地图、画笔涂抹（自由/障碍/未知）与画笔半径调节
- 一键清空、反转、保存至服务器，或导出到本地
- 内置“发送到机器狗”按钮，通过 rosbridge 发布 Base64 PGM 数据（`/map_editor/pgm_data`）

### 📤 快捷消息发布
- 右侧竖向按钮列针对当前视图提供预设指令
- 访问导航、摄像头与地图发布相关话题，一键发送 `std_msgs/Empty`
- 按钮自动根据连接状态与发布状态启用/禁用

## 前置条件

- Node.js ≥ 18
- ROS 环境，并安装运行 rosbridge_server（默认 WebSocket 端口 `9090`）

启动 rosbridge 示例：

```bash
roslaunch rosbridge_server rosbridge_websocket.launch
```

## 安装和运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

开发服务器默认运行在 `http://localhost:5173`。

## 使用说明

1. **连接 ROS 系统**
   - 在顶部输入框中输入 rosbridge WebSocket 地址（例如 `ws://localhost:9090`）
   - 点击"连接"按钮
   - 连接成功后，状态指示器会显示"已连接"

2. **切换视图**
   - 左侧标签可在「3D 导航视图」「摄像头视图」「地图编辑器」间切换
   - 当前视图说明会显示在标签下方

3. **3D 视图操作**
   - 左键拖拽：旋转视角
   - 右键拖拽：平移场景
   - 滚轮：缩放

4. **摄像头视图**
   - 默认订阅 `/camera/image_raw` 话题
   - 自动解码并显示图像数据

5. **地图编辑**
   - 地图编辑器读取服务器 `maps/` 目录下的 PGM 文件
   - 支持保存回目录、导出本地或通过 rosbridge 发布 Base64 数据
   - “发送到机器狗”按钮会向 `/map_editor/pgm_data` 发布 `std_msgs/String`（JSON：`{ name, encoding, data }`）

6. **快捷指令**
   - 右侧按钮会根据当前视图显示对应指令
   - 点击即可向预设话题发布 `std_msgs/Empty` 消息

## 项目结构

```
src/
├── App.vue               # 主应用组件，包含连接管理、视图切换与指令发布
├── components/
│   ├── View3D.vue        # 3D 导航可视化组件
│   ├── CameraViewer.vue  # 摄像头图像显示组件
│   └── MapEditor.vue     # PGM 地图在线编辑、保存与发布
├── main.js               # 应用入口
└── style.css             # 全局样式

## 服务器端地图目录

开发时，Vite 会提供 `/api/maps` 接口指向服务器本地目录：

- `GET /api/maps`：列出 `.pgm` 文件
- `GET /api/maps/{name}`：下载单个地图
- `PUT /api/maps/{name}`：保存编辑后的地图

默认目录为项目根目录下的 `maps/`，可通过环境变量 `PGM_DIR` 指定其他路径：

```bash
PGM_DIR="D:/maps" npm run dev
```

> 若需在生产环境使用，请在部署的 Node/反向代理层实现同等的文件访问接口。
```

## 技术栈

- **Vue 3** - 前端框架
- **Vite** - 构建工具
- **Three.js** - 3D 图形渲染
- **roslib** - ROS WebSocket 通信

## 自定义配置

### 修改默认话题

在 `src/components/View3D.vue` 中修改订阅的话题名称：
- 路径话题：`/path`
- 地图话题：`/map`
- 点云话题：`/points`

在 `src/components/CameraViewer.vue` 中修改默认摄像头话题：
- 图像话题：`/camera/image_raw`

在 `src/components/PublisherPanel.vue` 中修改预设发布话题列表。

## 注意事项

- 确保 rosbridge_server 已正确启动并监听指定端口
- 3D 视图需要浏览器支持 WebGL
- 图像解码性能取决于图像大小和帧率
- 建议在生产环境中配置 HTTPS 和适当的访问控制

## 许可证