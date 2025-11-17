<template>
    <div class="settings-panel">
        <el-form label-position="top" size="small">
            <!-- 话题选择 -->
            <div class="settings-section">
                <h4 class="section-title">图像话题</h4>

                <el-form-item label="选择话题" prop="selectedTopic">
                    <el-select id="image-topic-select" v-model="selectedTopic" placeholder="请选择图像话题" filterable
                        @change="handleTopicChange">
                        <el-option v-for="topic in imageTopics" :key="topic.name" :label="topic.name"
                            :value="topic.name">
                            <span>{{ topic.name }}</span>
                            <span style="color: #8c8c8c; font-size: 11px; margin-left: 4px">
                                {{ topic.messageType }}
                            </span>
                        </el-option>
                    </el-select>
                </el-form-item>
            </div>

            <!-- 显示选项 -->
            <div class="settings-section">
                <h4 class="section-title">显示选项</h4>

                <el-form-item label="平滑处理" prop="smooth">
                    <el-switch id="image-smooth" v-model="smooth" @change="handleSmoothChange" />
                </el-form-item>

                <el-form-item label="旋转角度" prop="rotation">
                    <el-slider id="image-rotation" v-model="rotation" :min="0" :max="360" :step="90"
                        :marks="{ 0: '0°', 90: '90°', 180: '180°', 270: '270°' }" @change="handleRotationChange" />
                </el-form-item>

                <el-form-item label="水平翻转" prop="flipHorizontal">
                    <el-switch id="image-flip-h" v-model="flipHorizontal" @change="handleFlipHChange" />
                </el-form-item>

                <el-form-item label="垂直翻转" prop="flipVertical">
                    <el-switch id="image-flip-v" v-model="flipVertical" @change="handleFlipVChange" />
                </el-form-item>
            </div>

            <!-- PTZ 云台控制 -->
            <div class="settings-section">
                <h4 class="section-title">云台控制</h4>

                <!-- 方向控制 -->
                <div class="ptz-direction">
                    <el-button class="ptz-btn ptz-up" :icon="ArrowUp" circle @mousedown="startPtzAction('ptz_up')"
                        @mouseup="stopPtzAction" @mouseleave="stopPtzAction"
                        @touchstart.prevent="startPtzAction('ptz_up')" @touchend.prevent="stopPtzAction" />
                    <div class="ptz-middle">
                        <el-button class="ptz-btn ptz-left" :icon="ArrowLeft" circle
                            @mousedown="startPtzAction('ptz_left')" @mouseup="stopPtzAction" @mouseleave="stopPtzAction"
                            @touchstart.prevent="startPtzAction('ptz_left')" @touchend.prevent="stopPtzAction" />
                        <el-button class="ptz-btn ptz-center" circle @click="publishPtzCommand('ptz_stop')">
                            <el-icon>
                                <CircleClose />
                            </el-icon>
                        </el-button>
                        <el-button class="ptz-btn ptz-right" :icon="ArrowRight" circle
                            @mousedown="startPtzAction('ptz_right')" @mouseup="stopPtzAction"
                            @mouseleave="stopPtzAction" @touchstart.prevent="startPtzAction('ptz_right')"
                            @touchend.prevent="stopPtzAction" />
                    </div>
                    <el-button class="ptz-btn ptz-down" :icon="ArrowDown" circle @mousedown="startPtzAction('ptz_down')"
                        @mouseup="stopPtzAction" @mouseleave="stopPtzAction"
                        @touchstart.prevent="startPtzAction('ptz_down')" @touchend.prevent="stopPtzAction" />
                </div>

                <!-- 缩放控制 -->
                <div class="ptz-zoom">
                    <el-button class="ptz-btn zoom-in" :icon="ZoomIn" circle @mousedown="startPtzAction('ptz_zoom_in')"
                        @mouseup="stopPtzAction" @mouseleave="stopPtzAction"
                        @touchstart.prevent="startPtzAction('ptz_zoom_in')" @touchend.prevent="stopPtzAction" />
                    <el-button class="ptz-btn zoom-out" :icon="ZoomOut" circle
                        @mousedown="startPtzAction('ptz_zoom_out')" @mouseup="stopPtzAction" @mouseleave="stopPtzAction"
                        @touchstart.prevent="startPtzAction('ptz_zoom_out')" @touchend.prevent="stopPtzAction" />
                </div>

                <!-- 旋转控制 -->
                <div class="ptz-spin">
                    <el-button class="ptz-btn spin-left" circle @click="publishPtzCommand('ptz_spin_left')">
                        <el-icon>
                            <RefreshLeft />
                        </el-icon>
                    </el-button>
                    <el-button class="ptz-btn spin-right" circle @click="publishPtzCommand('ptz_spin_right')">
                        <el-icon>
                            <RefreshRight />
                        </el-icon>
                    </el-button>
                </div>
            </div>
        </el-form>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import {
    ElForm,
    ElFormItem,
    ElSelect,
    ElOption,
    ElSwitch,
    ElSlider,
    ElButton,
    ElIcon
} from 'element-plus'
import {
    ArrowUp,
    ArrowDown,
    ArrowLeft,
    ArrowRight,
    ZoomIn,
    ZoomOut,
    CircleClose,
    RefreshLeft,
    RefreshRight
} from '@element-plus/icons-vue'
import { useImageSettingsStore } from '@/stores/imageSettings'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'

const settingsStore = useImageSettingsStore()
const rosStore = useRosStore()

const selectedTopic = ref(settingsStore.selectedTopic)
const smooth = ref(settingsStore.smooth)
const rotation = ref(settingsStore.rotation)
const flipHorizontal = ref(settingsStore.flipHorizontal)
const flipVertical = ref(settingsStore.flipVertical)

const imageTopics = computed(() => {
    return rosStore.topics.filter((t: { messageType: string }) =>
        t.messageType.includes('Image') ||
        t.messageType.includes('CompressedImage')
    )
})

const handleTopicChange = (value: string) => {
    settingsStore.setSelectedTopic(value)
}

const handleSmoothChange = (value: string | number | boolean) => {
    settingsStore.setSmooth(value as boolean)
}

const handleRotationChange = (value: number | number[]) => {
    const val = Array.isArray(value) ? value[0] : value
    settingsStore.setRotation(val)
}

const handleFlipHChange = (value: string | number | boolean) => {
    settingsStore.setFlipHorizontal(value as boolean)
}

const handleFlipVChange = (value: string | number | boolean) => {
    settingsStore.setFlipVertical(value as boolean)
}

// 同步 store 变化
watch(() => settingsStore.selectedTopic, (val) => { selectedTopic.value = val })
watch(() => settingsStore.smooth, (val) => { smooth.value = val })
watch(() => settingsStore.rotation, (val) => { rotation.value = val })
watch(() => settingsStore.flipHorizontal, (val) => { flipHorizontal.value = val })
watch(() => settingsStore.flipVertical, (val) => { flipVertical.value = val })

// PTZ 控制相关
let ptzInterval: number | null = null
const activePtzCommand = ref<string | null>(null)

const publishPtzCommand = async (command: string) => {
    const topic = `/camera/${command}`

    if (!rosConnection.isConnected()) {
        return
    }

    try {
        await rosConnection.publish(
            topic,
            'std_msgs/Empty',
            {}
        )
    } catch (error) {
        console.error(`Failed to publish PTZ command ${topic}:`, error)
    }
}

const stopPtzAction = (emitStop = true) => {
    if (ptzInterval) {
        clearInterval(ptzInterval)
        ptzInterval = null
    }

    if (emitStop && activePtzCommand.value) {
        publishPtzCommand('ptz_stop')
    }

    activePtzCommand.value = null
}

const startPtzAction = (command: string) => {
    if (activePtzCommand.value === command) {
        return
    }

    stopPtzAction(false)
    activePtzCommand.value = command
    publishPtzCommand(command)
    ptzInterval = window.setInterval(() => {
        publishPtzCommand(command)
    }, 200)
}

onUnmounted(() => {
    stopPtzAction()
})
</script>

<style scoped>
.settings-panel {
    width: 100%;
}

.settings-section {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #f0f0f0;
}

.settings-section:last-child {
    border-bottom: none;
}

.section-title {
    margin: 0 0 12px 0;
    font-size: 13px;
    font-weight: 600;
    color: #333;
}

:deep(.el-form-item) {
    margin-bottom: 16px;
}

:deep(.el-form-item__label) {
    font-size: 12px;
    color: #666;
    font-weight: 500;
}

:deep(.el-select) {
    width: 100%;
}

/* PTZ 控制样式 */
.ptz-direction {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    margin-bottom: 12px;
}

.ptz-middle {
    display: flex;
    align-items: center;
    gap: 6px;
}

.ptz-btn {
    width: 40px;
    height: 40px;
    transition: all 0.2s;
}

.ptz-btn:hover {
    transform: scale(1.05);
}

.ptz-btn:active {
    transform: scale(0.95);
}

.ptz-center {
    background: #f5f5f5;
}

.ptz-center:hover {
    background: #f56c6c;
    color: white;
    border-color: #f56c6c;
}

.ptz-zoom {
    display: flex;
    gap: 6px;
    justify-content: center;
    margin-bottom: 12px;
}

.ptz-spin {
    display: flex;
    gap: 6px;
    justify-content: center;
}
</style>
