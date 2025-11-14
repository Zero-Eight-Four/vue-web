<script setup>
import { ref, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import ROSLIB from 'roslib'

const props = defineProps({
  ros: {
    type: Object,
    default: null
  },
  connected: {
    type: Boolean,
    default: false
  },
  topicName: {
    type: String,
    default: '/camera/image_raw'
  },
  enableFrameLocking: {
    type: Boolean,
    default: true
  }
})

// UI 状态
const imageRef = ref(null)
const imageSrc = ref('')
const subscriptionStatus = ref('未订阅')
const messageCount = ref(0)
const frameDropCount = ref(0)
const lastError = ref('')
const debugInfo = ref({})
const isZoomed = ref(false)
const brightness = ref(100)
const contrast = ref(100)

// 内部状态管理
let imageListener = null
let currentMessageSequence = 0
let displayedMessageSequence = 0
let isProcessingMessage = false
let lastReceivedTimestamp = 0
const MESSAGE_BUFFER_SIZE = 2 // 缓冲队列大小
const messageBuffer = []

// 诊断信息计算属性
const statusColor = computed(() => {
  if (subscriptionStatus.value === '已连接') return '#0f9d58'
  if (subscriptionStatus.value === '订阅中...') return '#c06a00'
  if (subscriptionStatus.value.includes('错误')) return '#d92d3a'
  return '#888'
})

const imageStyle = computed(() => ({
  filter: `brightness(${brightness.value}%) contrast(${contrast.value}%)`
}))

const performanceMetrics = computed(() => ({
  messageCount: messageCount.value,
  droppedFrames: frameDropCount.value,
  dropRate: messageCount.value > 0 
    ? (frameDropCount.value / (messageCount.value + frameDropCount.value) * 100).toFixed(1)
    : '0'
}))

/**
 * 解码图像 - 参考 lichtblick 的实现模式
 * 支持多种格式：CompressedImage (JPEG/PNG)、RawImage (RGB8/BGR8/RGBA8)
 */
const decodeImage = (message) => {
  try {
    // 处理 CompressedImage 消息 - 最常见的格式
    if (message.data && (message.format || message.encoding === 'jpeg' || message.encoding === 'png')) {
      const data = message.data
      const isUint8Array = data instanceof Uint8Array
      const buffer = isUint8Array ? data : new Uint8Array(Object.values(data))
      
      // 转换为 base64 - 更高效的方法
      let binaryString = ''
      const chunkSize = 8192 // 避免堆栈溢出
      for (let i = 0; i < buffer.length; i += chunkSize) {
        binaryString += String.fromCharCode.apply(null, buffer.subarray(i, i + chunkSize))
      }
      const base64 = btoa(binaryString)
      
      debugInfo.value = {
        type: 'CompressedImage',
        dataLength: buffer.length,
        base64Length: base64.length,
        format: message.format || message.encoding,
        timestamp: new Date().toISOString()
      }
      
      const format = message.format || message.encoding || 'jpeg'
      if (format === 'jpeg' || format === 'jpg') {
        return `data:image/jpeg;base64,${base64}`
      } else if (format === 'png') {
        return `data:image/png;base64,${base64}`
      }
    }
    
    // 处理 Image 消息（非压缩）- 支持多种编码格式
    if (message.width && message.height && (
      message.encoding === 'rgb8' || 
      message.encoding === 'bgr8' || 
      message.encoding === 'rgba8' ||
      message.encoding === 'bgra8' ||
      message.encoding === 'mono8'
    )) {
      return decodeRawImage(message)
    }
    
    lastError.value = `无法识别的消息格式。消息键: ${Object.keys(message).join(', ')}`
    return null
  } catch (error) {
    lastError.value = `解码错误: ${error.message}`
    return null
  }
}

/**
 * 解码原始图像数据 - 类似 lichtblick 的 decodeRawImage
 */
const decodeRawImage = (message) => {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = message.width
    canvas.height = message.height
    const ctx = canvas.getContext('2d')
    const imageData = ctx.createImageData(message.width, message.height)
    
    // 处理消息数据 - 可能是 Uint8Array 或普通数组
    const data = message.data instanceof Uint8Array 
      ? message.data 
      : new Uint8Array(Object.values(message.data))

    // 确定通道数
    let channels = 3
    if (message.encoding === 'rgba8' || message.encoding === 'bgra8') {
      channels = 4
    } else if (message.encoding === 'mono8') {
      channels = 1
    }

    const pixelCount = message.width * message.height
    const step = message.step || (message.width * channels)

    // 性能优化：批量处理像素数据
    const srcBuffer = data
    const dstBuffer = imageData.data

    for (let i = 0; i < pixelCount; i++) {
      const srcOffset = (Math.floor(i / message.width) * step) + (i % message.width) * channels
      const dstOffset = i * 4

      if (message.encoding === 'rgb8') {
        dstBuffer[dstOffset] = srcBuffer[srcOffset]
        dstBuffer[dstOffset + 1] = srcBuffer[srcOffset + 1]
        dstBuffer[dstOffset + 2] = srcBuffer[srcOffset + 2]
        dstBuffer[dstOffset + 3] = 255
      } else if (message.encoding === 'bgr8') {
        dstBuffer[dstOffset] = srcBuffer[srcOffset + 2]
        dstBuffer[dstOffset + 1] = srcBuffer[srcOffset + 1]
        dstBuffer[dstOffset + 2] = srcBuffer[srcOffset]
        dstBuffer[dstOffset + 3] = 255
      } else if (message.encoding === 'rgba8') {
        dstBuffer[dstOffset] = srcBuffer[srcOffset]
        dstBuffer[dstOffset + 1] = srcBuffer[srcOffset + 1]
        dstBuffer[dstOffset + 2] = srcBuffer[srcOffset + 2]
        dstBuffer[dstOffset + 3] = srcBuffer[srcOffset + 3]
      } else if (message.encoding === 'bgra8') {
        dstBuffer[dstOffset] = srcBuffer[srcOffset + 2]
        dstBuffer[dstOffset + 1] = srcBuffer[srcOffset + 1]
        dstBuffer[dstOffset + 2] = srcBuffer[srcOffset]
        dstBuffer[dstOffset + 3] = srcBuffer[srcOffset + 3]
      } else if (message.encoding === 'mono8') {
        const gray = srcBuffer[srcOffset]
        dstBuffer[dstOffset] = gray
        dstBuffer[dstOffset + 1] = gray
        dstBuffer[dstOffset + 2] = gray
        dstBuffer[dstOffset + 3] = 255
      }
    }

    ctx.putImageData(imageData, 0, 0)
    
    debugInfo.value = {
      type: 'RawImage',
      encoding: message.encoding,
      width: message.width,
      height: message.height,
      step: step,
      dataLength: data.length,
      timestamp: new Date().toISOString()
    }
    
    return canvas.toDataURL('image/png')
  } catch (error) {
    lastError.value = `原始图像解码错误: ${error.message}`
    return null
  }
}

/**
 * 处理图像消息 - 实现帧缓冲和去重逻辑
 * 参考 lichtblick 的消息队列机制
 */
const handleImageMessage = async (message) => {
  currentMessageSequence++
  const messageSeq = currentMessageSequence
  
  // 如果启用了帧锁定，检查是否应该处理此消息
  if (props.enableFrameLocking && isProcessingMessage) {
    frameDropCount.value++
    return
  }

  // 添加到缓冲队列
  messageBuffer.push({ message, sequence: messageSeq })
  if (messageBuffer.length > MESSAGE_BUFFER_SIZE) {
    messageBuffer.shift()
  }

  // 处理队列中的最新消息
  if (!isProcessingMessage) {
    isProcessingMessage = true
    
    try {
      // 使用最新消息
      const { message: latestMsg, sequence: latestSeq } = messageBuffer[messageBuffer.length - 1]
      
      messageCount.value++
      lastReceivedTimestamp = Date.now()
      subscriptionStatus.value = `已连接 (${messageCount.value} 条消息)`
      
      // 解码图像
      const imageUrl = decodeImage(latestMsg)
      if (imageUrl) {
        imageSrc.value = imageUrl
        displayedMessageSequence = latestSeq
        lastError.value = ''
      } else {
        if (!lastError.value) {
          lastError.value = '图像解码失败'
        }
      }
      
      // 清空缓冲
      messageBuffer.length = 0
    } finally {
      isProcessingMessage = false
    }
  }
}

/**
 * 订阅图像话题
 */
const subscribeToImage = () => {
  if (!props.ros || !props.connected) {
    subscriptionStatus.value = '错误：ROS 未连接'
    return
  }

  subscriptionStatus.value = '订阅中...'
  lastError.value = ''
  messageCount.value = 0
  frameDropCount.value = 0
  currentMessageSequence = 0
  displayedMessageSequence = 0
  
  imageListener = new ROSLIB.Topic({
    ros: props.ros,
    name: props.topicName,
    messageType: 'sensor_msgs/Image'
  })

  imageListener.subscribe(handleImageMessage)
  subscriptionStatus.value = '订阅中，等待消息...'
}

/**
 * 取消订阅
 */
const unsubscribeFromImage = () => {
  if (imageListener) {
    imageListener.unsubscribe()
    imageListener = null
    subscriptionStatus.value = '未订阅'
    imageSrc.value = ''
    messageCount.value = 0
    frameDropCount.value = 0
  }
}

/**
 * 下载当前图像
 */
const downloadImage = () => {
  if (!imageSrc.value) {
    alert('没有图像可下载')
    return
  }
  
  const link = document.createElement('a')
  link.href = imageSrc.value
  link.download = `camera_${Date.now()}.png`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/**
 * 切换缩放模式
 */
const toggleZoom = () => {
  isZoomed.value = !isZoomed.value
}

/**
 * 重置亮度和对比度
 */
const resetImageSettings = () => {
  brightness.value = 100
  contrast.value = 100
}

/**
 * 增加亮度
 */
const increaseBrightness = () => {
  brightness.value = Math.min(brightness.value + 10, 200)
}

/**
 * 减少亮度
 */
const decreaseBrightness = () => {
  brightness.value = Math.max(brightness.value - 10, 50)
}

/**
 * 增加对比度
 */
const increaseContrast = () => {
  contrast.value = Math.min(contrast.value + 10, 200)
}

/**
 * 减少对比度
 */
const decreaseContrast = () => {
  contrast.value = Math.max(contrast.value - 10, 50)
}

watch(() => [props.connected, props.topicName], () => {
  unsubscribeFromImage()
  if (props.connected) {
    subscribeToImage()
  }
}, { immediate: true })

onBeforeUnmount(() => {
  unsubscribeFromImage()
})
</script>

<template>
  <div class="camera-viewer">
    <!-- 图像显示区域 -->
    <div v-if="imageSrc" class="image-container" :class="{ zoomed: isZoomed }">
      <img
        ref="imageRef"
        :src="imageSrc"
        class="camera-image"
        :style="imageStyle"
        alt="Camera feed"
        @click="toggleZoom"
      />
      
      <!-- 右上角控制按钮 -->
      <div class="control-panel">
        <button 
          class="control-btn zoom-btn"
          :title="`${isZoomed ? '缩小' : '放大'} (Z)`"
          @click="toggleZoom"
        >
          🔍
        </button>
        <button 
          class="control-btn download-btn"
          title="下载图像 (D)"
          @click="downloadImage"
        >
          ⬇️
        </button>
      </div>
      
      <!-- 底部信息栏 -->
      <div class="info-bar">
        <span class="info-text">{{ topicName }}</span>
        <span class="info-metrics">
          📊 {{ messageCount }} | 🔄 {{ frameDropCount }} | 🎯 {{ performanceMetrics.dropRate }}%
        </span>
      </div>
    </div>
    
    <!-- 占位符 -->
    <div v-else class="camera-placeholder">
      <p v-if="!connected" class="status-text">🔴 未连接 ROS</p>
      <p v-else class="status-text">⏳ 等待图像数据...</p>
      <p class="topic-info">📍 话题: {{ topicName }}</p>
      <p class="status-line" :style="{ color: statusColor }">
        状态: {{ subscriptionStatus }}
      </p>
      
      <div v-if="lastError" class="error-message">
        ❌ {{ lastError }}
      </div>
      
      <div v-if="debugInfo && Object.keys(debugInfo).length" class="debug-info">
        <p>📊 调试信息:</p>
        <pre>{{ JSON.stringify(debugInfo, null, 2) }}</pre>
      </div>
    </div>
    
    <!-- 调整面板（显示图像时可见） -->
    <div v-if="imageSrc" class="adjustment-panel">
      <div class="adjustment-group">
        <label>亮度</label>
        <div class="slider-container">
          <button @click="decreaseBrightness" class="adj-btn">−</button>
          <input 
            v-model.number="brightness" 
            type="range" 
            min="50" 
            max="200" 
            class="slider"
            title="调整亮度"
          />
          <button @click="increaseBrightness" class="adj-btn">+</button>
          <span class="value">{{ brightness }}%</span>
        </div>
      </div>
      
      <div class="adjustment-group">
        <label>对比度</label>
        <div class="slider-container">
          <button @click="decreaseContrast" class="adj-btn">−</button>
          <input 
            v-model.number="contrast" 
            type="range" 
            min="50" 
            max="200" 
            class="slider"
            title="调整对比度"
          />
          <button @click="increaseContrast" class="adj-btn">+</button>
          <span class="value">{{ contrast }}%</span>
        </div>
      </div>
      
      <button class="reset-btn" @click="resetImageSettings">
        🔄 重置
      </button>
    </div>
  </div>
</template>

<style scoped>
.camera-viewer {
  width: 100%;
  height: 100%;
  position: relative;
  background: #1a1a1a;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 图像容器 */
.image-container {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background: #0a0a0a;
  cursor: zoom-in;
  transition: all 0.3s ease;
}

.image-container.zoomed {
  cursor: zoom-out;
  overflow: auto;
}

.camera-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
  transition: filter 0.2s ease;
  user-select: none;
}

.image-container.zoomed .camera-image {
  width: 150%;
  height: 150%;
  max-width: none;
  max-height: none;
}

/* 控制面板 */
.control-panel {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 8px;
  background: rgba(0, 0, 0, 0.5);
  padding: 8px;
  border-radius: 6px;
  backdrop-filter: blur(4px);
  z-index: 10;
}

.control-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.control-btn:active {
  transform: scale(0.95);
}

/* 信息栏 */
.info-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 36px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.7), transparent);
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 0 12px 8px 12px;
  font-size: 12px;
  color: #aaa;
}

.info-text {
  font-family: monospace;
  color: #888;
}

.info-metrics {
  font-weight: 500;
  color: #0f9d58;
}

/* 占位符 */
.camera-placeholder {
  flex: 1;
  color: #ccc;
  text-align: center;
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  max-width: 90%;
  margin: 0 auto;
}

.camera-placeholder p {
  margin: 8px 0;
}

.status-text {
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 16px;
}

.topic-info {
  font-size: 12px;
  color: #888;
  font-family: monospace;
  margin-bottom: 8px;
}

.status-line {
  font-size: 13px;
  font-weight: 500;
  margin: 12px 0;
  transition: color 0.3s ease;
}

.error-message {
  margin-top: 12px;
  padding: 8px 12px;
  background: rgba(217, 45, 58, 0.2);
  border-left: 3px solid #d92d3a;
  color: #ff6b6b;
  font-size: 12px;
  border-radius: 4px;
  text-align: left;
  word-break: break-word;
  max-width: 400px;
}

.debug-info {
  margin-top: 16px;
  text-align: left;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 4px;
  max-height: 150px;
  overflow-y: auto;
  color: #aaa;
  max-width: 400px;
}

.debug-info p {
  margin: 0 0 8px 0;
  color: #888;
  font-weight: 600;
}

.debug-info pre {
  margin: 0;
  background: rgba(0, 0, 0, 0.3);
  padding: 6px;
  border-radius: 3px;
  overflow-x: auto;
  font-size: 10px;
}

/* 调整面板 */
.adjustment-panel {
  background: rgba(30, 30, 30, 0.95);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 12px;
  display: flex;
  gap: 16px;
  align-items: center;
  min-height: 60px;
  backdrop-filter: blur(4px);
}

.adjustment-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 200px;
}

.adjustment-group label {
  font-size: 12px;
  color: #aaa;
  font-weight: 600;
  text-transform: uppercase;
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 6px;
}

.slider {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, #333, #555);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #0f9d58;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 0 4px rgba(15, 157, 88, 0.6);
}

.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #0f9d58;
  cursor: pointer;
  border: none;
  transition: all 0.2s ease;
  box-shadow: 0 0 4px rgba(15, 157, 88, 0.6);
}

.slider::-webkit-slider-thumb:hover {
  transform: scale(1.3);
  box-shadow: 0 0 8px rgba(15, 157, 88, 0.8);
}

.slider::-moz-range-thumb:hover {
  transform: scale(1.3);
  box-shadow: 0 0 8px rgba(15, 157, 88, 0.8);
}

.adj-btn {
  width: 28px;
  height: 28px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #aaa;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.adj-btn:hover {
  background: rgba(15, 157, 88, 0.2);
  color: #0f9d58;
  border-color: rgba(15, 157, 88, 0.4);
}

.adj-btn:active {
  transform: scale(0.9);
}

.value {
  font-size: 12px;
  color: #0f9d58;
  font-weight: 600;
  min-width: 45px;
  text-align: right;
}

.reset-btn {
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
  color: #aaa;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.reset-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border-color: rgba(255, 255, 255, 0.3);
}

.reset-btn:active {
  transform: scale(0.95);
}

/* 响应式设计 */
@media (max-width: 640px) {
  .adjustment-panel {
    flex-wrap: wrap;
    min-height: auto;
  }
  
  .adjustment-group {
    min-width: 160px;
  }
  
  .info-bar {
    font-size: 11px;
  }
  
  .control-btn {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }
}
</style>

