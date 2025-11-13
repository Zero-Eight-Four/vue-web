<script setup>
import { ref, onBeforeUnmount, watch } from 'vue'
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
    default: '/camera/image_raw/compressed'
  }
})

const imageRef = ref(null)
const imageSrc = ref('')
let imageListener = null

const decodeImage = (message) => {
  try {
    // 处理 CompressedImage 消息
    if (message.data && message.format) {
      // CompressedImage 的 data 是 Uint8Array，format 是 jpeg 或 png
      const data = message.data
      let binaryString = ''
      
      // 将 Uint8Array 转换为二进制字符串
      for (let i = 0; i < data.length; i++) {
        binaryString += String.fromCharCode(data[i])
      }
      
      // 转换为 base64
      const base64 = btoa(binaryString)
      
      // 根据格式设置正确的 MIME 类型
      if (message.format === 'jpeg' || message.format === 'jpg') {
        return `data:image/jpeg;base64,${base64}`
      } else if (message.format === 'png') {
        return `data:image/png;base64,${base64}`
      }
    }
    
    // 处理 Image 消息（非压缩）
    if (message.encoding === 'rgb8' || message.encoding === 'bgr8') {
      const canvas = document.createElement('canvas')
      canvas.width = message.width
      canvas.height = message.height
      const ctx = canvas.getContext('2d')
      const imageData = ctx.createImageData(message.width, message.height)
      const data = new Uint8Array(message.data)

      for (let i = 0; i < message.width * message.height; i++) {
        const offset = i * 3
        if (message.encoding === 'rgb8') {
          imageData.data[i * 4] = data[offset]
          imageData.data[i * 4 + 1] = data[offset + 1]
          imageData.data[i * 4 + 2] = data[offset + 2]
        } else {
          imageData.data[i * 4] = data[offset + 2]
          imageData.data[i * 4 + 1] = data[offset + 1]
          imageData.data[i * 4 + 2] = data[offset]
        }
        imageData.data[i * 4 + 3] = 255
      }

      ctx.putImageData(imageData, 0, 0)
      return canvas.toDataURL('image/png')
    }
  } catch (error) {
    console.error('Error decoding image:', error)
  }
  return null
}

const subscribeToImage = () => {
  if (!props.ros || !props.connected) return

  imageListener = new ROSLIB.Topic({
    ros: props.ros,
    name: props.topicName,
    messageType: 'sensor_msgs/CompressedImage',
    throttle_rate: 30
  })

  imageListener.subscribe((message) => {
    const imageUrl = decodeImage(message)
    if (imageUrl) {
      imageSrc.value = imageUrl
    }
  })
}

const unsubscribeFromImage = () => {
  if (imageListener) {
    imageListener.unsubscribe()
    imageListener = null
  }
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
    <img
      v-if="imageSrc"
      ref="imageRef"
      :src="imageSrc"
      class="camera-image"
      alt="Camera feed"
    />
    <div v-if="!connected" class="camera-placeholder">
      <p>未连接</p>
    </div>
    <div v-else-if="!imageSrc" class="camera-placeholder">
      <p>等待图像数据...</p>
      <p class="topic-name">{{ topicName }}</p>
    </div>
  </div>
</template>

<style scoped>
.camera-viewer {
  width: 100%;
  height: 100%;
  position: relative;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.camera-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  display: block;
}

.camera-placeholder {
  color: #888;
  text-align: center;
  padding: 20px;
}

.camera-placeholder p {
  margin: 8px 0;
}

.topic-name {
  font-size: 12px;
  color: #666;
  font-family: monospace;
}
</style>

