<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import ROSLIB from "roslib";

const props = defineProps({
  ros: {
    type: Object,
    default: null,
  },
  connected: {
    type: Boolean,
    default: false,
  },
});

const canvasRef = ref(null);
const fileInputRef = ref(null);
const boardRef = ref(null);
const fileName = ref("");
const saveAsName = ref("");
const mapMeta = ref(null);
const mode = ref("pointer"); // "pointer" 或 "brush" 或其他工具
const tool = ref("free");
const brushSize = ref(8);
const isDrawing = ref(false);
const lastPoint = ref(null);
const scale = ref(1);
const mapsList = ref([]);
const selectedMap = ref("");
const listLoading = ref(false);
const mapLoading = ref(false);
const saving = ref(false);
const sending = ref(false);
const uploading = ref(false);
const errorMessage = ref("");
const isDragging = ref(false);
const dragStart = ref(null);
const selectionStart = ref(null); // 框选开始点
const selectionEnd = ref(null); // 框选结束点
const isLoaded = computed(() => Boolean(mapMeta.value));

const TOOL_VALUES = {
  free: 255,
  occupied: 0,
  unknown: 205,
};

const TOOL_LABELS = {
  free: "自由区域",
  occupied: "障碍区域",
  unknown: "未知区域",
};

const MODE_LABELS = {
  pointer: "指针",
  brush: "画笔",
  "rect-select": "框选",
  eraser: "橡皮擦",
  fill: "填充",
};

const parsePgmBuffer = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let offset = 0;

  const readChar = () => {
    if (offset >= bytes.length) {
      throw new Error("文件截断：无法读取文件头");
    }
    return String.fromCharCode(bytes[offset++]);
  };

  const readToken = () => {
    let token = "";
    let char;

    // 循环直到找到一个有效的 token
    while (true) {
      if (offset >= bytes.length) {
        throw new Error("文件截断：无法读取 token");
      }
      char = readChar();

      // 跳过空白符
      while (char === " " || char === "\n" || char === "\r" || char === "\t") {
        if (offset >= bytes.length) {
          throw new Error("文件截断：无法读取 token");
        }
        char = readChar();
      }

      // 检查是否是注释
      if (char === "#") {
        // 跳过整行注释
        while (char !== "\n") {
          if (offset >= bytes.length) {
            throw new Error("文件截断：注释行未以换行符结束");
          }
          char = readChar();
        }
        // 继续循环以读取下一个 token
        continue;
      }

      // 不是注释也不是空白，开始读取 token
      break;
    }

    // 读取 token 直到遇到空白或文件末尾
    while (char !== " " && char !== "\n" && char !== "\r" && char !== "\t") {
      token += char;
      if (offset >= bytes.length) {
        break;
      }
      char = readChar();
    }

    if (!token) {
      throw new Error("无法读取有效的 token");
    }

    return token;
  };

  // 读取魔数
  const magic = readChar() + readChar();
  if (magic !== "P5" && magic !== "P2") {
    throw new Error(`不支持的 PGM 格式：${magic}（仅支持 P5 或 P2）`);
  }

  // 读取宽度、高度、最大灰度值
  let width, height, maxGray;

  try {
    const widthStr = readToken();
    const heightStr = readToken();
    const maxGrayStr = readToken();

    width = parseInt(widthStr, 10);
    height = parseInt(heightStr, 10);
    maxGray = parseInt(maxGrayStr, 10);

    console.log(
      `[DEBUG] 解析头部: 宽度字符串='${widthStr}', 高度字符串='${heightStr}', 灰度字符串='${maxGrayStr}'`
    );
  } catch (error) {
    throw new Error(`PGM 文件头解析失败：${error.message}`);
  }

  if (Number.isNaN(width) || Number.isNaN(height) || Number.isNaN(maxGray)) {
    throw new Error(
      `PGM 文件头解析失败：宽=${width}, 高=${height}, 灰度=${maxGray}`
    );
  }

  if (width <= 0 || height <= 0 || maxGray <= 0) {
    throw new Error(
      `PGM 文件参数无效：宽=${width}, 高=${height}, 灰度=${maxGray}`
    );
  }

  const pixelCount = width * height;
  const pixels = new Uint8ClampedArray(pixelCount);

  if (magic === "P5") {
    // 二进制 P5 格式
    if (maxGray > 255) {
      throw new Error("暂不支持深度灰度 PGM (maxGray > 255)");
    }
    const remaining = new Uint8Array(buffer, offset);
    if (remaining.length < pixelCount) {
      throw new Error(
        `PGM 文件数据长度不足：需要 ${pixelCount} 字节，实际 ${remaining.length} 字节`
      );
    }
    pixels.set(remaining.subarray(0, pixelCount));
  } else {
    // 文本 P2 格式
    const text = new TextDecoder().decode(buffer.slice(offset));
    const values = text
      .trim()
      .split(/\s+/)
      .map((value) => {
        const parsed = parseInt(value, 10);
        return Number.isNaN(parsed) ? 0 : parsed;
      });

    if (values.length < pixelCount) {
      throw new Error(
        `PGM 文本数据长度不足：需要 ${pixelCount} 值，实际 ${values.length} 值`
      );
    }

    for (let i = 0; i < pixelCount; i += 1) {
      pixels[i] = Math.min(
        255,
        Math.max(0, Math.round((values[i] / maxGray) * 255))
      );
    }
  }

  return { width, height, maxGray: 255, pixels };
};

const readPgm = async (file) => parsePgmBuffer(await file.arrayBuffer());

const uploadLocalPgm = async (file) => {
  if (!file) return;

  errorMessage.value = "";
  uploading.value = true;

  try {
    // 验证文件扩展名
    if (!file.name.toLowerCase().endsWith(".pgm")) {
      throw new Error("请选择 .pgm 文件");
    }

    // 读取并解析 PGM 文件
    const pgm = await readPgm(file);
    mapMeta.value = pgm;
    fileName.value = file.name;
    if (!saveAsName.value) {
      saveAsName.value = file.name;
    }
    scale.value = Math.min(600 / pgm.width, 600 / pgm.height, 2);
    drawPixelsToCanvas();
    centerMapInView();
  } catch (error) {
    console.error("upload local pgm error", error);
    errorMessage.value = error.message || "上传 PGM 文件失败";
  } finally {
    uploading.value = false;
    // 重置文件输入
    if (fileInputRef.value) {
      fileInputRef.value.value = "";
    }
  }
};

const handleFileInputChange = (event) => {
  const file = event.target.files?.[0];
  if (file) {
    uploadLocalPgm(file);
  }
};

const triggerFileInput = () => {
  fileInputRef.value?.click();
};

const drawPixelsToCanvas = () => {
  if (!canvasRef.value || !mapMeta.value) return;
  const { width, height, pixels } = mapMeta.value;
  const canvas = canvasRef.value;
  const context = canvas.getContext("2d");

  canvas.width = width;
  canvas.height = height;

  const imageData = context.createImageData(width, height);
  for (let i = 0; i < pixels.length; i += 1) {
    const pixel = pixels[i];
    imageData.data[i * 4] = pixel;
    imageData.data[i * 4 + 1] = pixel;
    imageData.data[i * 4 + 2] = pixel;
    imageData.data[i * 4 + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);
};

const centerMapInView = () => {
  // grid layout 会自动处理居中，这里可以为空
  // 或者用于其他需要的滚动调整
};

const fetchMapsList = async () => {
  listLoading.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch("/api/maps");
    if (!response.ok) {
      throw new Error("读取地图目录失败");
    }
    const data = await response.json();
    mapsList.value = data;
    if (!selectedMap.value && data.length) {
      selectedMap.value = data[0].name;
    }
  } catch (error) {
    console.error("fetch maps list error", error);
    errorMessage.value = error.message || "无法获取地图列表";
    mapsList.value = [];
  } finally {
    listLoading.value = false;
  }
};

const loadMapFromServer = async (name) => {
  if (!name) return;
  mapLoading.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch(`/api/maps/${encodeURIComponent(name)}`);
    if (!response.ok) {
      throw new Error("地图加载失败");
    }
    const buffer = await response.arrayBuffer();
    const pgm = parsePgmBuffer(buffer);
    mapMeta.value = pgm;
    fileName.value = name;
    if (!saveAsName.value) {
      saveAsName.value = name;
    }
    scale.value = Math.min(600 / pgm.width, 600 / pgm.height, 2);
    drawPixelsToCanvas();
    centerMapInView();
  } catch (error) {
    console.error("load map error", error);
    errorMessage.value = error.message || "无法加载地图";
  } finally {
    mapLoading.value = false;
  }
};

const getCanvasPoint = (event) => {
  const canvas = canvasRef.value;
  if (!canvas || !mapMeta.value) return null;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(
    ((event.clientX - rect.left) * canvas.width) / rect.width
  );
  const y = Math.floor(
    ((event.clientY - rect.top) * canvas.height) / rect.height
  );
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null;
  return { x, y };
};

const drawAtPoint = (point, value = null) => {
  if (!mapMeta.value) return;
  const { width, pixels } = mapMeta.value;
  const brushRadius = Math.max(1, Math.floor(brushSize.value / 2));
  const fillValue = value !== null ? value : TOOL_VALUES[tool.value];
  
  for (let dy = -brushRadius; dy <= brushRadius; dy += 1) {
    for (let dx = -brushRadius; dx <= brushRadius; dx += 1) {
      const xx = point.x + dx;
      const yy = point.y + dy;
      if (dx * dx + dy * dy > brushRadius * brushRadius) continue;
      if (xx < 0 || yy < 0 || xx >= width || yy >= mapMeta.value.height)
        continue;
      pixels[yy * width + xx] = fillValue;
    }
  }
  drawPixelsToCanvas();
};

const fillRect = (startPoint, endPoint, value) => {
  if (!mapMeta.value) return;
  const { width, height, pixels } = mapMeta.value;
  
  const minX = Math.max(0, Math.min(startPoint.x, endPoint.x));
  const maxX = Math.min(width, Math.max(startPoint.x, endPoint.x));
  const minY = Math.max(0, Math.min(startPoint.y, endPoint.y));
  const maxY = Math.min(height, Math.max(startPoint.y, endPoint.y));
  
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      pixels[y * width + x] = value;
    }
  }
  drawPixelsToCanvas();
};

const floodFill = (startPoint, fillValue) => {
  if (!mapMeta.value) return;
  const { width, height, pixels } = mapMeta.value;
  const startIndex = startPoint.y * width + startPoint.x;
  const originalValue = pixels[startIndex];
  
  if (originalValue === fillValue) return; // 已经是目标颜色
  
  const stack = [startPoint];
  const visited = new Set();
  
  while (stack.length > 0) {
    const point = stack.pop();
    const index = point.y * width + point.x;
    
    if (index < 0 || index >= pixels.length) continue;
    if (visited.has(index)) continue;
    if (pixels[index] !== originalValue) continue;
    
    visited.add(index);
    pixels[index] = fillValue;
    
    // 添加相邻点（4邻接）
    if (point.x > 0) stack.push({ x: point.x - 1, y: point.y });
    if (point.x < width - 1) stack.push({ x: point.x + 1, y: point.y });
    if (point.y > 0) stack.push({ x: point.x, y: point.y - 1 });
    if (point.y < height - 1) stack.push({ x: point.x, y: point.y + 1 });
  }
  
  drawPixelsToCanvas();
};

const handleCanvasDown = (event) => {
  if (!mapMeta.value) return;

  // 在指针模式下，左键用于拖动地图
  if (event.button === 0 && mode.value === "pointer") {
    isDragging.value = true;
    dragStart.value = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: boardRef.value.scrollLeft,
      scrollTop: boardRef.value.scrollTop,
    };
    event.preventDefault();
    return;
  }

  // 中键用于拖动地图（所有模式）
  const isMiddleClick = event.button === 1;
  if (isMiddleClick) {
    isDragging.value = true;
    dragStart.value = {
      x: event.clientX,
      y: event.clientY,
      scrollLeft: boardRef.value.scrollLeft,
      scrollTop: boardRef.value.scrollTop,
    };
    event.preventDefault();
    return;
  }

  // 框选工具
  if (event.button === 0 && mode.value === "rect-select") {
    const point = getCanvasPoint(event);
    if (!point) return;
    isDrawing.value = true;
    selectionStart.value = point;
    selectionEnd.value = point;
    return;
  }

  // 橡皮擦工具
  if (event.button === 0 && mode.value === "eraser") {
    const point = getCanvasPoint(event);
    if (!point) return;
    isDrawing.value = true;
    lastPoint.value = point;
    drawAtPoint(point, 255); // 橡皮擦绘制自由区域
    return;
  }

  // 填充工具
  if (event.button === 0 && mode.value === "fill") {
    const point = getCanvasPoint(event);
    if (!point) return;
    floodFill(point, TOOL_VALUES[tool.value]);
    return;
  }

  // 左键用于绘制（仅在画笔模式下）
  if (event.button === 0 && mode.value === "brush") {
    const point = getCanvasPoint(event);
    if (!point) return;
    isDrawing.value = true;
    lastPoint.value = point;
    drawAtPoint(point);
  }
};

const handleCanvasMove = (event) => {
  // 处理地图拖动
  if (isDragging.value && dragStart.value && boardRef.value) {
    const deltaX = event.clientX - dragStart.value.x;
    const deltaY = event.clientY - dragStart.value.y;
    boardRef.value.scrollLeft = dragStart.value.scrollLeft - deltaX;
    boardRef.value.scrollTop = dragStart.value.scrollTop - deltaY;
    event.preventDefault();
    return;
  }

  // 处理框选
  if (isDrawing.value && mode.value === "rect-select" && selectionStart.value) {
    const point = getCanvasPoint(event);
    if (!point) return;
    selectionEnd.value = point;
    return;
  }

  // 处理橡皮擦
  if (isDrawing.value && mode.value === "eraser") {
    const point = getCanvasPoint(event);
    if (!point) return;
    if (!lastPoint.value) {
      drawAtPoint(point, 255);
      lastPoint.value = point;
      return;
    }
    const dx = point.x - lastPoint.value.x;
    const dy = point.y - lastPoint.value.y;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 1; i <= steps; i += 1) {
      const intermediate = {
        x: Math.round(lastPoint.value.x + (dx * i) / steps),
        y: Math.round(lastPoint.value.y + (dy * i) / steps),
      };
      drawAtPoint(intermediate, 255);
    }
    lastPoint.value = point;
    return;
  }

  // 处理画笔绘制
  if (!isDrawing.value || !mapMeta.value) return;
  const point = getCanvasPoint(event);
  if (!point) return;
  if (!lastPoint.value) {
    drawAtPoint(point);
    lastPoint.value = point;
    return;
  }
  const dx = point.x - lastPoint.value.x;
  const dy = point.y - lastPoint.value.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i <= steps; i += 1) {
    const intermediate = {
      x: Math.round(lastPoint.value.x + (dx * i) / steps),
      y: Math.round(lastPoint.value.y + (dy * i) / steps),
    };
    drawAtPoint(intermediate);
  }
  lastPoint.value = point;
};

const handleCanvasUp = () => {
  if (mode.value === "rect-select" && selectionStart.value && selectionEnd.value) {
    fillRect(selectionStart.value, selectionEnd.value, TOOL_VALUES[tool.value]);
    selectionStart.value = null;
    selectionEnd.value = null;
  }
  
  isDrawing.value = false;
  isDragging.value = false;
  lastPoint.value = null;
  dragStart.value = null;
};

const handleCanvasLeave = () => {
  isDrawing.value = false;
  isDragging.value = false;
  lastPoint.value = null;
  dragStart.value = null;
};

const resetCanvasEvents = () => {
  isDrawing.value = false;
  isDragging.value = false;
  lastPoint.value = null;
  dragStart.value = null;
};

const clearMap = () => {
  if (!mapMeta.value) return;
  mapMeta.value.pixels.fill(255);
  drawPixelsToCanvas();
};

const invertMap = () => {
  if (!mapMeta.value) return;
  mapMeta.value.pixels = mapMeta.value.pixels.map((value) => 255 - value);
  drawPixelsToCanvas();
};

const zoomIn = () => {
  if (!mapMeta.value) return;
  scale.value = Math.min(scale.value * 1.2, 4);
  centerMapInView();
};

const zoomOut = () => {
  if (!mapMeta.value) return;
  scale.value = Math.max(scale.value / 1.2, 0.5);
  centerMapInView();
};

const resetZoom = () => {
  if (!mapMeta.value) return;
  scale.value = Math.min(
    600 / mapMeta.value.width,
    600 / mapMeta.value.height,
    2
  );
  centerMapInView();
};

const buildPgmBuffer = () => {
  if (!mapMeta.value) return null;
  const { width, height, pixels } = mapMeta.value;
  const header = `P5\n${width} ${height}\n255\n`;
  const headerBytes = new TextEncoder().encode(header);
  const buffer = new Uint8Array(headerBytes.length + pixels.length);
  buffer.set(headerBytes, 0);
  buffer.set(pixels, headerBytes.length);
  return buffer;
};

const downloadPgm = () => {
  const buffer = buildPgmBuffer();
  if (!buffer) return;
  const blob = new Blob([buffer], { type: "image/x-portable-graymap" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName.value
    ? fileName.value.replace(/\.pgm$/i, "_edited.pgm")
    : "edited_map.pgm";
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 0);
};

const saveToServer = async () => {
  if (!mapMeta.value) return;
  const buffer = buildPgmBuffer();
  if (!buffer) return;

  const targetName = (
    saveAsName.value ||
    fileName.value ||
    "edited_map.pgm"
  ).trim();
  if (!targetName) {
    alert("请填写保存文件名");
    return;
  }
  const filename = targetName.toLowerCase().endsWith(".pgm")
    ? targetName
    : `${targetName}.pgm`;

  saving.value = true;
  errorMessage.value = "";
  try {
    const response = await fetch(`/api/maps/${encodeURIComponent(filename)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
      },
      body: buffer,
    });
    if (!response.ok && response.status !== 204) {
      throw new Error("上传地图失败");
    }
    fileName.value = filename;
    saveAsName.value = filename;
    if (!mapsList.value.some((item) => item.name === filename)) {
      await fetchMapsList();
    }
    alert("地图已保存到服务器");
  } catch (error) {
    console.error("save map error", error);
    errorMessage.value = error.message || "保存地图失败";
  } finally {
    saving.value = false;
  }
};

const toBase64 = (buffer) => {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const sendToRobot = async () => {
  if (!mapMeta.value) {
    alert("请先加载并编辑地图");
    return;
  }
  if (!props.connected || !props.ros) {
    alert("请先连接到 rosbridge");
    return;
  }
  const buffer = buildPgmBuffer();
  if (!buffer) return;

  sending.value = true;
  try {
    const payload = {
      name: saveAsName.value || fileName.value || "edited_map.pgm",
      encoding: "base64",
      data: toBase64(buffer),
    };
    const topic = new ROSLIB.Topic({
      ros: props.ros,
      name: "/map_editor/pgm_data",
      messageType: "std_msgs/String",
    });
    topic.publish(new ROSLIB.Message({ data: JSON.stringify(payload) }));
    alert("地图数据已通过 rosbridge 发送");
  } catch (error) {
    console.error("send map error", error);
    alert(error.message || "发送到机器狗失败");
  } finally {
    sending.value = false;
  }
};

onBeforeUnmount(() => {
  resetCanvasEvents();
});

onMounted(() => {
  fetchMapsList();
});

watch(selectedMap, (newValue, oldValue) => {
  if (newValue && newValue !== oldValue) {
    loadMapFromServer(newValue);
  }
});

// 向父组件暴露地图编辑器的状态和方法
defineExpose({
  mapsList,
  selectedMap,
  fileName,
  saveAsName,
  mapMeta,
  isLoaded,
  mode,
  tool,
  brushSize,
  listLoading,
  mapLoading,
  saving,
  sending,
  uploading,
  errorMessage,
  fetchMapsList,
  loadMapFromServer,
  uploadLocalPgm,
  triggerFileInput,
  clearMap,
  invertMap,
  zoomIn,
  zoomOut,
  resetZoom,
  downloadPgm,
  saveToServer,
  sendToRobot,
  props,
});
</script>

<template>
  <div class="map-editor" :class="`${mode}-mode`">
    <div class="toolbar">
      <div class="toolbar-group">
        <label class="toolbar-label">模式</label>
        <div class="tool-options">
          <button
            v-for="m in Object.keys(MODE_LABELS)"
            :key="m"
            type="button"
            class="tool-btn"
            :class="{ active: mode === m }"
            @click="mode = m"
            :title="
              m === 'pointer' ? '选择指针以查看地图' : 
              m === 'brush' ? '选择画笔以编辑地图' :
              m === 'rect-select' ? '拖拽框选区域并填充' :
              m === 'eraser' ? '橡皮擦工具' :
              m === 'fill' ? '点击填充连通区域' : ''
            "
          >
            {{ MODE_LABELS[m] }}
          </button>
        </div>
      </div>
      <div class="divider" />
      <div class="toolbar-group">
        <label class="toolbar-label">工具</label>
        <div class="tool-options">
          <button
            v-for="toolMode in Object.keys(TOOL_LABELS)"
            :key="toolMode"
            type="button"
            class="tool-btn"
            :class="{ active: tool === toolMode }"
            @click="tool = toolMode"
            :disabled="mode !== 'brush' && mode !== 'rect-select' && mode !== 'fill'"
          >
            {{ TOOL_LABELS[toolMode] }}
          </button>
        </div>
      </div>
      <div class="toolbar-group">
        <label class="toolbar-label">
          画笔大小
          <span class="value">{{ brushSize }}</span>
        </label>
        <input
          v-model.number="brushSize"
          type="range"
          min="1"
          max="32"
          class="slider"
          :disabled="mode !== 'brush' && mode !== 'eraser'"
        />
      </div>
      <div class="toolbar-group">
        <label class="toolbar-label">缩放</label>
        <div class="zoom-controls">
          <button
            type="button"
            class="tool-btn zoom-btn"
            :disabled="!isLoaded || scale <= 0.5"
            @click="zoomOut"
            title="缩小"
          >
            −
          </button>
          <span class="zoom-display">{{ (scale * 100).toFixed(0) }}%</span>
          <button
            type="button"
            class="tool-btn zoom-btn"
            :disabled="!isLoaded || scale >= 4"
            @click="zoomIn"
            title="放大"
          >
            +
          </button>
        </div>
        <button
          type="button"
          class="tool-btn zoom-reset-btn"
          :disabled="!isLoaded"
          @click="resetZoom"
          title="重置为原始比例"
        >
          重置
        </button>
      </div>
      <div class="divider" />
      <button
        type="button"
        class="action-btn secondary"
        :disabled="!isLoaded"
        @click="clearMap"
      >
        清空地图
      </button>
      <button
        type="button"
        class="action-btn secondary"
        :disabled="!isLoaded"
        @click="invertMap"
      >
        反转颜色
      </button>
      <button
        type="button"
        class="action-btn secondary"
        :disabled="!isLoaded"
        @click="downloadPgm"
        title="导出为 PGM 文件"
      >
        导出
      </button>
    </div>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputRef"
      type="file"
      accept=".pgm"
      style="display: none"
      @change="handleFileInputChange"
    />

    <div class="canvas-board" :class="{ empty: !isLoaded }" ref="boardRef">
      <div
        v-if="isLoaded"
        class="board-inner"
        :style="{
          width: `${mapMeta.width * scale}px`,
          height: `${mapMeta.height * scale}px`,
        }"
      >
        <canvas
          ref="canvasRef"
          :style="{
            width: `${mapMeta.width * scale}px`,
            height: `${mapMeta.height * scale}px`,
          }"
          @mousedown="handleCanvasDown"
          @mousemove="handleCanvasMove"
          @mouseup="handleCanvasUp"
          @mouseleave="handleCanvasLeave"
        />
      </div>
      <div v-else class="empty-state">
        <p>请加载 PGM 地图文件，支持 ROS 导出的二进制 P5 或文本 P2 格式。</p>
      </div>
    </div>

    <footer class="status-bar">
      <div v-if="errorMessage" class="status-item error">
        <span class="value">{{ errorMessage }}</span>
      </div>
      <div class="status-item">
        <span class="label">当前文件</span>
        <span class="value">{{ fileName || "未加载" }}</span>
      </div>
      <div class="status-item" v-if="isLoaded">
        <span class="label">尺寸</span>
        <span class="value">{{ mapMeta.width }} × {{ mapMeta.height }}</span>
      </div>
      <div class="status-item" v-if="isLoaded">
        <span class="label">画笔</span>
        <span class="value">{{ TOOL_LABELS[tool] }} · {{ brushSize }}px</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.map-editor {
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
}

.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  padding: 16px 18px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #d7e2f4;
  border-radius: 14px;
  box-shadow: 0 12px 24px -20px rgba(25, 49, 107, 0.4);
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-label {
  font-size: 13px;
  font-weight: 600;
  color: #3c4d6c;
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-label .value {
  font-size: 12px;
  font-weight: 500;
  color: #6a7ca3;
}

.tool-options {
  display: inline-flex;
  gap: 6px;
  background: rgba(143, 167, 217, 0.12);
  border-radius: 10px;
  padding: 4px;
}

.tool-btn {
  padding: 8px 14px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: #556689;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tool-btn.active {
  background: white;
  color: #1f3d71;
  box-shadow: 0 6px 15px -12px rgba(41, 66, 128, 0.6);
}

.zoom-controls {
  display: inline-flex;
  gap: 4px;
  background: rgba(143, 167, 217, 0.12);
  border-radius: 10px;
  padding: 4px;
}

.zoom-btn {
  padding: 6px 12px;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.zoom-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zoom-btn:not(:disabled):hover {
  background: rgba(91, 123, 255, 0.15);
  color: #5b7bff;
}

.zoom-display {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 50px;
  font-size: 12px;
  font-weight: 600;
  color: #3c4d6c;
  flex-shrink: 0;
}

.zoom-reset-btn {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
  background: white;
  border: 1px solid #ced9f0;
  color: #3c4d6c;
  margin-left: 4px;
}

.zoom-reset-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.zoom-reset-btn:not(:disabled):hover {
  background: rgba(91, 123, 255, 0.08);
  color: #5b7bff;
}

.slider {
  accent-color: #5b7bff;
}

.divider {
  width: 1px;
  height: 32px;
  background: #d7e2f4;
  margin: 0 6px;
}

.action-btn {
  padding: 9px 16px;
  border-radius: 10px;
  border: 1px solid transparent;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.action-btn.primary {
  background: linear-gradient(135deg, #5b7bff, #7f8dff);
  color: white;
  box-shadow: 0 12px 20px -18px rgba(83, 111, 255, 0.75);
}

.action-btn.accent {
  background: linear-gradient(135deg, #ffb74d, #ff9671);
  color: #3a2f10;
  border: 1px solid rgba(255, 183, 77, 0.4);
  box-shadow: 0 12px 22px -20px rgba(255, 148, 76, 0.65);
}

.action-btn.accent:disabled {
  opacity: 0.5;
}

.action-btn.primary:disabled {
  opacity: 0.5;
}

.action-btn.secondary {
  background: white;
  border: 1px solid #ced9f0;
  color: #3c4d6c;
}

.action-btn.secondary:disabled {
  opacity: 0.5;
}

.select {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #ced9f0;
  background: white;
  font-size: 13px;
  color: #314569;
}

.name-input {
  padding: 8px 12px;
  border-radius: 8px;
  border: 1px solid #ced9f0;
  background: white;
  font-size: 13px;
  color: #314569;
  min-width: 180px;
}

.canvas-board {
  flex: 1;
  border-radius: 18px;
  border: 1px solid #d4def3;
  background: white;
  position: relative;
  overflow: auto;
  box-shadow: 0 18px 45px -32px rgba(30, 48, 96, 0.45);
  cursor: grab;
  padding: 20px;
  display: grid;
  place-items: center;
  min-height: 0;
}

.canvas-board:active {
  cursor: grabbing;
}

.canvas-board.empty {
  background: linear-gradient(
    135deg,
    rgba(173, 196, 241, 0.1),
    rgba(255, 255, 255, 0.55)
  );
  display: grid;
  place-items: center;
  padding: 0;
}

.board-inner {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(91, 123, 255, 0.25);
  background: repeating-linear-gradient(
    45deg,
    rgba(173, 196, 241, 0.12),
    rgba(173, 196, 241, 0.12) 12px,
    rgba(232, 239, 255, 0.12) 12px,
    rgba(232, 239, 255, 0.12) 24px
  );
}

.empty-state {
  text-align: center;
  max-width: 420px;
  color: #556689;
  font-size: 14px;
  line-height: 1.6;
  padding: 0 20px;
}

.status-bar {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 14px 18px;
  border-radius: 12px;
  border: 1px solid #d7e2f4;
  background: rgba(255, 255, 255, 0.92);
  font-size: 12px;
  color: #4a5a79;
}

.status-item.error {
  color: #d43030;
  font-weight: 600;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-item .label {
  font-weight: 600;
}

.status-item .value {
  font-family: "Fira Code", monospace;
  color: #2f416a;
}

canvas {
  cursor: default;
}

/* 指针模式时显示指针光标 */
.map-editor.pointer-mode canvas {
  cursor: grab;
}

.map-editor.pointer-mode canvas:active {
  cursor: grabbing;
}

/* 画笔模式时显示绘制光标 */
.map-editor.brush-mode canvas {
  cursor: crosshair;
}
</style>
