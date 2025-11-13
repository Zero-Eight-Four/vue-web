<script setup>
import { computed, onBeforeUnmount, ref } from "vue";
import ROSLIB from "roslib";
import View3D from "./components/View3D.vue";
import CameraViewer from "./components/CameraViewer.vue";
import MapEditor from "./components/MapEditor.vue";

const wsUrl = ref("ws://192.168.1.103:9090");
const status = ref("disconnected");
const statusDetail = ref("");
const activePanel = ref("navigation");
const publishStates = ref({});
const topicsCollapsed = ref(true);
const mapEditorRef = ref(null);
let ros = null;

const isConnecting = computed(() => status.value === "connecting");
const isConnected = computed(() => status.value === "connected");

const panelOptions = [
  {
    id: "navigation",
    label: "3D 导航视图",
    description: "查看路径、地图和点云，了解机器人在空间中的状态。",
    actionCaption: "导航控制",
  },
  {
    id: "camera",
    label: "摄像头视图",
    description: "实时查看来自机器人摄像头的话题图像。",
    actionCaption: "摄像头控制",
  },
  {
    id: "map-editor",
    label: "地图编辑器",
    description: "加载 PGM 地图文件，在浏览器中修订并导出。",
    actionCaption: "地图操作",
  },
];

const publisherPresets = {
  navigation: [
    {
      label: "开始导航",
      topic: "/start_navigation",
      type: "std_msgs/Empty",
      hint: "启动路径跟随任务",
    },
    {
      label: "暂停导航",
      topic: "/pause_navigation",
      type: "std_msgs/Empty",
      hint: "暂停当前任务",
    },
    {
      label: "继续导航",
      topic: "/resume_navigation",
      type: "std_msgs/Empty",
      hint: "恢复行进",
    },
    {
      label: "重置定位",
      topic: "/reset_pose",
      type: "std_msgs/Empty",
      hint: "重新估计定位",
    },
    {
      label: "紧急停止",
      topic: "/emergency_stop",
      type: "std_msgs/Empty",
      hint: "立即停止所有运动",
    },
  ],
  camera: [
    {
      label: "开始推流",
      topic: "/camera/start_stream",
      type: "std_msgs/Empty",
      hint: "开启图像推流",
    },
    {
      label: "停止推流",
      topic: "/camera/stop_stream",
      type: "std_msgs/Empty",
      hint: "关闭图像推流",
    },
    {
      label: "拍照",
      topic: "/camera/capture",
      type: "std_msgs/Empty",
      hint: "抓取一帧静态图像",
    },
    {
      label: "自动曝光",
      topic: "/camera/auto_exposure",
      type: "std_msgs/Empty",
      hint: "恢复自动曝光设置",
    },
    {
      label: "复位镜头",
      topic: "/camera/reset",
      type: "std_msgs/Empty",
      hint: "复位摄像头参数",
    },
  ],
};

const panelTopics = {
  navigation: [
    { topic: "/path", description: "导航路径 (nav_msgs/Path)" },
    { topic: "/map", description: "占用栅格地图 (nav_msgs/OccupancyGrid)" },
    { topic: "/points", description: "点云数据 (sensor_msgs/PointCloud2)" },
  ],
  camera: [
    {
      topic: "/camera/image_raw/compressed",
      description: "摄像头图像 (sensor_msgs/CompressedImage)",
    },
  ],
  "map-editor": [
    { topic: "/api/maps", description: "服务器目录 (HTTP 接口)" },
    {
      topic: "/map_editor/pgm_data",
      description: "地图数据 (std_msgs/String)",
    },
  ],
};

const statusBadge = computed(() => {
  switch (status.value) {
    case "connected":
      return { label: "已连接", tone: "connected" };
    case "connecting":
      return { label: "连接中…", tone: "connecting" };
    case "error":
      return { label: "连接错误", tone: "error" };
    default:
      return { label: "未连接", tone: "disconnected" };
  }
});

const activePanelMeta = computed(
  () =>
    panelOptions.find((panel) => panel.id === activePanel.value) ||
    panelOptions[0]
);
const activePublishers = computed(
  () => publisherPresets[activePanel.value] || []
);
const activeTopics = computed(() => panelTopics[activePanel.value] || []);

const getPresetKey = (preset) => `${preset.topic}|${preset.type}`;
const isPresetPublishing = (preset) =>
  Boolean(publishStates.value[getPresetKey(preset)]);

const connect = () => {
  if (isConnecting.value || isConnected.value) return;
  const url = wsUrl.value.trim();
  if (!url) return;

  statusDetail.value = "";
  status.value = "connecting";

  try {
    ros = new ROSLIB.Ros({ url });

    ros.on("connection", () => {
      status.value = "connected";
      statusDetail.value = "";
    });

    ros.on("close", () => {
      status.value = "disconnected";
      statusDetail.value = "连接已关闭";
      ros = null;
    });

    ros.on("error", (error) => {
      status.value = "error";
      statusDetail.value = error?.message || "连接失败";
    });
  } catch (error) {
    status.value = "error";
    statusDetail.value = error?.message || "无法创建连接";
    ros = null;
  }
};

const disconnect = () => {
  if (!ros) {
    status.value = "disconnected";
    statusDetail.value = "";
    return;
  }

  try {
    ros.close();
  } catch (error) {
    status.value = "error";
    statusDetail.value = error?.message || "关闭连接时出错";
  } finally {
    ros = null;
    if (status.value !== "error") {
      status.value = "disconnected";
      statusDetail.value = "";
    }
  }
};

const handleSubmit = (event) => {
  event.preventDefault();
  connect();
};

const switchPanel = (panelId) => {
  activePanel.value = panelId;
};

const publishMessage = (preset) => {
  if (!ros || !isConnected.value) {
    statusDetail.value = "请先连接 rosbridge";
    return;
  }

  const key = getPresetKey(preset);
  if (publishStates.value[key]) return;

  publishStates.value[key] = true;

  try {
    const topic = new ROSLIB.Topic({
      ros,
      name: preset.topic,
      messageType: preset.type,
    });

    const message = new ROSLIB.Message({});
    topic.publish(message);
  } catch (error) {
    status.value = "error";
    statusDetail.value = error?.message || "消息发布失败";
  } finally {
    setTimeout(() => {
      publishStates.value[key] = false;
    }, 400);
  }
};

onBeforeUnmount(() => {
  if (ros) {
    ros.close();
    ros = null;
  }
});
</script>

<template>
  <div class="app-container">
    <header class="app-header">
      <div class="header-left">
        <h1 class="app-title">ROS Dashboard</h1>
        <span class="status-indicator" :class="statusBadge.tone">
          <span class="status-dot"></span>
          <span class="status-text">{{ statusBadge.label }}</span>
        </span>
      </div>
      <form class="connection-form" @submit="handleSubmit">
        <input
          v-model="wsUrl"
          class="url-input"
          :disabled="isConnecting || isConnected"
          placeholder="ws://localhost:9090"
          autocomplete="off"
        />
        <button
          type="submit"
          class="btn btn-primary"
          :disabled="!wsUrl.trim() || isConnecting || isConnected"
        >
          连接
        </button>
        <button
          type="button"
          class="btn btn-secondary"
          :disabled="!isConnected && status !== 'error'"
          @click="disconnect"
        >
          断开
        </button>
      </form>
    </header>

    <div v-if="statusDetail" class="status-message" :class="statusBadge.tone">
      {{ statusDetail }}
    </div>

    <div class="main-layout">
      <section class="view-section">
        <div class="panel-tabs">
          <button
            v-for="panel in panelOptions"
            :key="panel.id"
            type="button"
            class="panel-tab"
            :class="{ active: activePanel === panel.id }"
            @click="switchPanel(panel.id)"
          >
            {{ panel.label }}
          </button>
        </div>
        <p class="panel-description">{{ activePanelMeta.description }}</p>

        <div class="view-stage">
          <View3D
            v-if="activePanel === 'navigation'"
            :ros="ros"
            :connected="isConnected"
          />
          <CameraViewer
            v-else-if="activePanel === 'camera'"
            :ros="ros"
            :connected="isConnected"
            topic-name="/camera/image_raw/compressed"
          />
          <MapEditor
            ref="mapEditorRef"
            v-else-if="activePanel === 'map-editor'"
            :ros="ros"
            :connected="isConnected"
          />
          <div
            v-if="!isConnected && activePanel !== 'map-editor'"
            class="view-overlay"
          >
            <p>请连接 机器狗 以查看实时数据</p>
          </div>
        </div>

        <div class="topics-footer" :class="{ collapsed: topicsCollapsed }">
          <button
            type="button"
            class="topics-toggle"
            @click="topicsCollapsed = !topicsCollapsed"
          >
            <span>{{ topicsCollapsed ? "展开订阅话题" : "收起订阅话题" }}</span>
            <span class="toggle-icon">{{ topicsCollapsed ? "▸" : "▾" }}</span>
          </button>
          <div v-show="!topicsCollapsed" class="topic-summary" role="list">
            <div
              v-for="topic in activeTopics"
              :key="topic.topic"
              class="topic-row"
              role="listitem"
            >
              <code class="topic-name">{{ topic.topic }}</code>
              <span class="topic-desc">{{ topic.description }}</span>
            </div>
          </div>
        </div>
      </section>

      <aside class="publisher-section">
        <template v-if="activePanel === 'map-editor' && mapEditorRef">
          <h2>地图工具</h2>
          <p class="publisher-caption">地图加载、编辑与管理</p>
          <div class="map-tools">
            <div class="tool-group">
              <label class="tool-label">地图列表</label>
              <select
                v-model="mapEditorRef.selectedMap"
                class="tool-select"
                :disabled="mapEditorRef.listLoading"
              >
                <option value="" disabled>选择地图</option>
                <option
                  v-for="map in mapEditorRef.mapsList"
                  :key="map.name"
                  :value="map.name"
                >
                  {{ map.name }}
                </option>
              </select>
              <button
                type="button"
                class="tool-btn secondary"
                @click="mapEditorRef.fetchMapsList"
                :disabled="mapEditorRef.listLoading"
              >
                {{ mapEditorRef.listLoading ? "刷新中…" : "刷新列表" }}
              </button>
            </div>

            <div class="tool-group">
              <button
                type="button"
                class="tool-btn secondary"
                @click="mapEditorRef.triggerFileInput"
                :disabled="mapEditorRef.uploading"
              >
                {{ mapEditorRef.uploading ? "上传中…" : "上传本地PGM" }}
              </button>
              <button
                type="button"
                class="tool-btn secondary"
                :disabled="!mapEditorRef.selectedMap || mapEditorRef.mapLoading"
                @click="
                  mapEditorRef.loadMapFromServer(mapEditorRef.selectedMap)
                "
              >
                {{ mapEditorRef.mapLoading ? "加载中…" : "加载地图" }}
              </button>
            </div>

            <div class="divider" />

            <div class="tool-group">
              <button
                type="button"
                class="tool-btn secondary"
                :disabled="!mapEditorRef.isLoaded"
                @click="mapEditorRef.clearMap"
              >
                清空地图
              </button>
              <button
                type="button"
                class="tool-btn secondary"
                :disabled="!mapEditorRef.isLoaded"
                @click="mapEditorRef.invertMap"
              >
                反转颜色
              </button>
            </div>

            <div class="divider" />

            <div class="tool-group">
              <label class="tool-label">保存为</label>
              <input
                v-model="mapEditorRef.saveAsName"
                type="text"
                class="tool-input"
                placeholder="edited_map.pgm"
              />
            </div>

            <div class="tool-group">
              <button
                type="button"
                class="tool-btn primary"
                :disabled="!mapEditorRef.isLoaded || mapEditorRef.saving"
                @click="mapEditorRef.saveToServer"
              >
                {{ mapEditorRef.saving ? "保存中…" : "保存到服务器" }}
              </button>
              <button
                type="button"
                class="tool-btn accent"
                :disabled="
                  !mapEditorRef.isLoaded ||
                  mapEditorRef.sending ||
                  !mapEditorRef.props.connected
                "
                @click="mapEditorRef.sendToRobot"
              >
                {{ mapEditorRef.sending ? "发送中…" : "发送到机器狗" }}
              </button>
              <button
                type="button"
                class="tool-btn secondary"
                :disabled="!mapEditorRef.isLoaded"
                @click="mapEditorRef.downloadPgm"
              >
                下载到本地
              </button>
            </div>
          </div>
        </template>
        <template v-else>
          <h2>快速操作</h2>
          <p class="publisher-caption">{{ activePanelMeta.actionCaption }}</p>
          <div class="publish-list">
            <button
              v-for="preset in activePublishers"
              :key="preset.topic"
              type="button"
              class="publish-button"
              :disabled="!isConnected || isPresetPublishing(preset)"
              @click="publishMessage(preset)"
            >
              <span class="publish-label">{{ preset.label }}</span>
              <span class="publish-hint">{{ preset.hint }}</span>
              <code class="publish-topic">{{ preset.topic }}</code>
            </button>
          </div>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, #f8fbff 0%, #f1f5ff 35%, #eef2fb 100%);
  color: #1f2d3d;
  overflow: hidden;
}

.app-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 28px;
  border-bottom: 1px solid #d9e2f1;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  box-shadow: 0 6px 18px -14px rgba(15, 35, 95, 0.45);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 18px;
}

.app-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #17396b;
  letter-spacing: 0.02em;
}

.status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: #e2e8f6;
  color: #475569;
  border: 1px solid #d1def2;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}

.status-indicator.connected {
  background: rgba(79, 209, 141, 0.18);
  color: #0f9d58;
  border-color: rgba(79, 209, 141, 0.35);
}

.status-indicator.connecting {
  background: rgba(255, 193, 71, 0.18);
  color: #c06a00;
  border-color: rgba(255, 193, 71, 0.35);
}

.status-indicator.error {
  background: rgba(255, 112, 102, 0.2);
  color: #d92d3a;
  border-color: rgba(255, 112, 102, 0.4);
}

.connection-form {
  display: flex;
  align-items: center;
  gap: 12px;
}

.url-input {
  width: 260px;
  padding: 8px 14px;
  background: white;
  border: 1px solid #c2d4ec;
  border-radius: 8px;
  color: #1f2d3d;
  font-family: "Fira Code", monospace;
  font-size: 13px;
  box-shadow: inset 0 2px 4px rgba(15, 34, 74, 0.05);
}

.url-input:focus {
  outline: none;
  border-color: #5b7bff;
  box-shadow: 0 0 0 3px rgba(91, 123, 255, 0.2);
}

.btn {
  padding: 9px 20px;
  border-radius: 8px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #5b7bff, #7f8dff);
  color: white;
  box-shadow: 0 8px 18px -10px rgba(83, 111, 255, 0.7);
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 12px 20px -12px rgba(83, 111, 255, 0.85);
}

.btn-secondary {
  background: white;
  color: #314155;
  border: 1px solid #c8d3e4;
  box-shadow: 0 3px 8px -6px rgba(26, 46, 89, 0.25);
}

.btn-secondary:hover:not(:disabled) {
  border-color: #97abc8;
  background: #f3f7ff;
}

.status-message {
  padding: 12px 28px;
  font-size: 13px;
  border-bottom: 1px solid #dbe4f4;
  background: rgba(255, 255, 255, 0.9);
}

.status-message.connected {
  color: #0f9d58;
}

.status-message.connecting {
  color: #c06a00;
}

.status-message.error {
  color: #d92d3a;
}

.main-layout {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 0;
  min-height: 0;
}

.view-section {
  display: flex;
  flex-direction: column;
  padding: 22px 28px 26px 28px;
  gap: 18px;
  min-height: 0;
}

.panel-tabs {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #cdd9f1;
  border-radius: 12px;
  padding: 5px;
  gap: 6px;
  box-shadow: 0 10px 18px -16px rgba(28, 51, 112, 0.4);
}

.panel-tab {
  border: none;
  background: transparent;
  color: #5a6c85;
  font-size: 13px;
  padding: 9px 18px;
  border-radius: 9px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease;
}

.panel-tab.active {
  background: linear-gradient(135deg, #5b7bff, #7f8dff);
  color: white;
  font-weight: 600;
  box-shadow: 0 4px 12px -8px rgba(83, 111, 255, 0.8);
}

.panel-tab:hover {
  color: #384e6f;
}

.panel-description {
  margin: 0;
  font-size: 13px;
  color: #5a6785;
}

.topic-summary {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid #d4def3;
  box-shadow: 0 10px 26px -22px rgba(33, 56, 115, 0.35);
}

.topic-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.topic-name {
  font-size: 12px;
  font-family: "Fira Code", monospace;
  background: rgba(91, 123, 255, 0.1);
  padding: 4px 8px;
  border-radius: 6px;
  color: #364a86;
  width: fit-content;
  border: 1px solid rgba(91, 123, 255, 0.25);
}

.topic-desc {
  font-size: 12px;
  color: #6b7a96;
}

.view-stage {
  flex: 1;
  position: relative;
  border-radius: 18px;
  border: 1px solid #d4def3;
  background: white;
  overflow: hidden;
  min-height: 0;
  box-shadow: 0 16px 45px -35px rgba(26, 48, 96, 0.55);
}

.view-stage > * {
  width: 100%;
  height: 100%;
}

.view-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.85);
  color: #5f6f8d;
  font-size: 14px;
  letter-spacing: 0.2px;
}

.topics-footer {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.topics-footer.collapsed .topic-summary {
  display: none;
}

.topics-toggle {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 10px;
  border: 1px solid #c8d6f0;
  background: white;
  color: #51627d;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 8px 18px -18px rgba(33, 52, 102, 0.7);
}

.topics-toggle:hover {
  background: #f4f7ff;
  border-color: #9fb4df;
  box-shadow: 0 12px 22px -22px rgba(33, 52, 102, 0.92);
}

.toggle-icon {
  font-size: 12px;
  color: #7a8aa8;
  transform: translateY(-1px);
}

.publisher-section {
  border-left: 1px solid #dbe3f4;
  background: rgba(255, 255, 255, 0.78);
  padding: 26px 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: -12px 0 26px -26px rgba(22, 42, 96, 0.55);
}

.publisher-section h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1e3761;
}

.publisher-caption {
  margin: 0;
  font-size: 13px;
  color: #5c6d88;
}

.map-tools {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 12px;
}

.tool-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool-label {
  font-size: 12px;
  font-weight: 600;
  color: #3c4d6c;
}

.tool-select,
.tool-input {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #ced9f0;
  background: white;
  font-size: 12px;
  color: #314569;
  font-family: inherit;
}

.tool-btn {
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn.primary {
  background: linear-gradient(135deg, #5b7bff, #7f8dff);
  color: white;
  box-shadow: 0 8px 18px -14px rgba(83, 111, 255, 0.65);
}

.tool-btn.primary:disabled {
  opacity: 0.5;
}

.tool-btn.accent {
  background: linear-gradient(135deg, #ffb74d, #ff9671);
  color: #3a2f10;
  border: 1px solid rgba(255, 183, 77, 0.4);
  box-shadow: 0 8px 18px -14px rgba(255, 148, 76, 0.55);
}

.tool-btn.accent:disabled {
  opacity: 0.5;
}

.tool-btn.secondary {
  background: white;
  border: 1px solid #ced9f0;
  color: #3c4d6c;
}

.tool-btn.secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.divider {
  width: 100%;
  height: 1px;
  background: #d7e2f4;
  margin: 8px 0;
}

.publish-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 8px;
}

.publish-button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1px solid #ced9f0;
  background: #ffffff;
  color: inherit;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
  box-shadow: 0 12px 20px -22px rgba(28, 48, 94, 0.45);
}

.publish-button:hover:not(:disabled) {
  border-color: #99acd5;
  background: #f6f9ff;
  box-shadow: 0 16px 24px -22px rgba(28, 48, 94, 0.55);
}

.publish-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.publish-label {
  font-size: 14px;
  font-weight: 600;
  color: #223a63;
}

.publish-hint {
  font-size: 12px;
  color: #607193;
}

.publish-topic {
  font-size: 11px;
  font-family: "Fira Code", monospace;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(91, 123, 255, 0.1);
  color: #3d4f7c;
  border: 1px solid rgba(91, 123, 255, 0.2);
}

@media (max-width: 980px) {
  .main-layout {
    grid-template-columns: 1fr;
  }

  .publisher-section {
    border-left: none;
    border-top: 1px solid #dbe3f4;
    flex-direction: row;
    flex-wrap: wrap;
    gap: 14px;
    box-shadow: inset 0 10px 24px -24px rgba(24, 46, 90, 0.25);
  }

  .publish-list {
    flex-direction: row;
    flex-wrap: wrap;
    gap: 12px;
  }

  .publish-button {
    flex: 1 1 160px;
  }
}
</style>
