<template>
    <div class="image-panel">
        <div v-if="!selectedTopic" class="no-topic">
            <p>请在右侧设置中选择图像话题</p>
        </div>
        <div v-else class="image-container">
            <canvas ref="imageCanvas" class="image-canvas"></canvas>
            <div v-if="!hasImage" class="loading">
                <el-icon class="is-loading">
                    <Loading />
                </el-icon>
                <span>等待图像数据...</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { ElIcon } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useImageSettingsStore } from '@/stores/imageSettings'
import { rosConnection } from '@/services/rosConnection'
import type { RosMessage } from '@/types/ros'

const settingsStore = useImageSettingsStore()
const imageCanvas = ref<HTMLCanvasElement>()
const hasImage = ref(false)
const selectedTopic = ref('')

const handleImageMessage = (message: RosMessage) => {
    if (!imageCanvas.value) return

    try {
        let imageData: string | null = null

        // 处理 sensor_msgs/Image (未压缩图像)
        if (message.encoding && message.width && message.height && message.data) {
            const canvas = imageCanvas.value
            const ctx = canvas.getContext('2d')
            if (!ctx) return

            canvas.width = message.width
            canvas.height = message.height

            const encoding = String(message.encoding).toLowerCase()

            // 处理不同的图像编码格式
            if (encoding.includes('rgb8') || encoding.includes('bgr8')) {
                // RGB/BGR 格式
                let data: Uint8Array

                if (message.data instanceof Uint8Array) {
                    data = message.data
                } else if (typeof message.data === 'string') {
                    // roslib.js 将二进制数据编码为 base64 字符串,需要解码
                    const binaryString = atob(message.data)
                    data = new Uint8Array(binaryString.length)
                    for (let i = 0; i < binaryString.length; i++) {
                        data[i] = binaryString.charCodeAt(i)
                    }
                } else {
                    data = new Uint8Array(message.data)
                }

                const imgData = ctx.createImageData(message.width, message.height)
                const isBGR = encoding.includes('bgr')

                for (let i = 0; i < data.length; i += 3) {
                    const idx = (i / 3) * 4
                    if (isBGR) {
                        imgData.data[idx] = data[i + 2]     // R
                        imgData.data[idx + 1] = data[i + 1] // G
                        imgData.data[idx + 2] = data[i]     // B
                    } else {
                        imgData.data[idx] = data[i]         // R
                        imgData.data[idx + 1] = data[i + 1] // G
                        imgData.data[idx + 2] = data[i + 2] // B
                    }
                    imgData.data[idx + 3] = 255 // A
                }
                ctx.putImageData(imgData, 0, 0)
                hasImage.value = true
                return
            } else if (encoding.includes('mono8') || encoding === '8uc1') {
                // 灰度图像
                let data: Uint8Array

                if (message.data instanceof Uint8Array) {
                    data = message.data
                } else if (typeof message.data === 'string') {
                    // roslib.js 将二进制数据编码为 base64 字符串,需要解码
                    const binaryString = atob(message.data)
                    data = new Uint8Array(binaryString.length)
                    for (let i = 0; i < binaryString.length; i++) {
                        data[i] = binaryString.charCodeAt(i)
                    }
                } else {
                    data = new Uint8Array(message.data)
                }

                const imgData = ctx.createImageData(message.width, message.height)
                for (let i = 0; i < data.length; i++) {
                    const idx = i * 4
                    imgData.data[idx] = data[i]     // R
                    imgData.data[idx + 1] = data[i] // G
                    imgData.data[idx + 2] = data[i] // B
                    imgData.data[idx + 3] = 255     // A
                }
                ctx.putImageData(imgData, 0, 0)
                hasImage.value = true
                return
            }
        }

        // 处理 CompressedImage 消息
        if (message.data) {
            // 检查是否是 base64 字符串
            if (typeof message.data === 'string') {
                // 确定图像格式
                let format = 'jpeg' // 默认格式
                if (message.format) {
                    // format 可能是 "jpeg", "png", 或 "image/jpeg", "image/png" 等
                    const formatStr = String(message.format).toLowerCase()
                    if (formatStr.includes('png')) {
                        format = 'png'
                    } else if (formatStr.includes('jpeg') || formatStr.includes('jpg')) {
                        format = 'jpeg'
                    }
                }
                imageData = `data:image/${format};base64,${message.data}`
            }
            // 处理 Uint8Array 格式 (CompressedImage 的二进制数据)
            else if (message.data instanceof Uint8Array || Array.isArray(message.data)) {
                const uint8Array = message.data instanceof Uint8Array
                    ? message.data
                    : new Uint8Array(message.data)

                // 转换为 base64
                let binary = ''
                const len = uint8Array.byteLength
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(uint8Array[i])
                }
                const base64 = btoa(binary)

                let format = 'jpeg'
                if (message.format) {
                    const formatStr = String(message.format).toLowerCase()
                    if (formatStr.includes('png')) {
                        format = 'png'
                    }
                }
                imageData = `data:image/${format};base64,${base64}`
            }
        }

        if (imageData) {
            const img = new Image()

            img.onload = () => {
                const canvas = imageCanvas.value
                if (!canvas) return

                const ctx = canvas.getContext('2d')
                if (!ctx) return

                canvas.width = img.width
                canvas.height = img.height
                ctx.drawImage(img, 0, 0)
                hasImage.value = true
            }

            img.onerror = (err) => {
                console.error('Failed to load image:', err)
            }

            img.src = imageData
        } else {
            console.warn('No valid image data found in message')
        }
    } catch (error) {
        console.error('Error processing image message:', error)
    }
}

// 监听话题变化
watch(() => settingsStore.selectedTopic, async (newTopic, oldTopic) => {
    // 取消旧订阅
    if (oldTopic) {
        rosConnection.unsubscribe(oldTopic)
    }

    selectedTopic.value = newTopic
    hasImage.value = false

    // 订阅新话题
    if (newTopic) {
        // 检查是否已连接
        if (!rosConnection.isConnected()) {
            return
        }

        try {
            // 获取话题的消息类型
            const topics = await rosConnection.getTopics()
            const topicInfo = topics.find(t => t.name === newTopic)

            if (!topicInfo) {
                console.error('Topic not found:', newTopic)
                return
            }

            const messageType = topicInfo.messageType

            await rosConnection.subscribe({
                topic: newTopic,
                messageType: messageType,
                callback: handleImageMessage
            })
        } catch (err) {
            console.error('Failed to subscribe to image topic:', err)
        }
    }
}, { immediate: true })

onUnmounted(() => {
    if (selectedTopic.value) {
        rosConnection.unsubscribe(selectedTopic.value)
    }
})
</script>

<style scoped>
.image-panel {
    width: 100%;
    height: 100%;
    background-color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
}

.no-topic {
    text-align: center;
    color: #999;
}

.no-topic p {
    font-size: 14px;
}

.image-container {
    width: 100%;
    height: 100%;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background-color: #1a1a1a;
}

.image-canvas {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.loading {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    color: #999;
}

.loading .el-icon {
    font-size: 32px;
}
</style>
