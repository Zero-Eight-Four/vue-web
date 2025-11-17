<template>
    <div class="settings-panel">
        <el-form label-position="top" size="small">
            <!-- 显示选项 -->
            <div class="settings-section">
                <h4 class="section-title">显示选项</h4>

                <el-form-item label="显示网格" prop="showGrid">
                    <el-switch id="threed-show-grid" v-model="showGrid" @change="handleGridChange" />
                </el-form-item>

                <el-form-item label="显示坐标轴" prop="showAxes">
                    <el-switch id="threed-show-axes" v-model="showAxes" @change="handleAxesChange" />
                </el-form-item>

                <el-form-item label="背景颜色" prop="backgroundColor">
                    <el-color-picker id="threed-bg-color" v-model="backgroundColor" @change="handleColorChange" />
                </el-form-item>
            </div>

            <!-- 话题可见性 -->
            <div class="settings-section">
                <h4 class="section-title">话题可见性</h4>

                <div v-if="availableTopics.length === 0" class="empty-hint">
                    暂无可用话题
                </div>

                <el-checkbox-group v-else v-model="visibleTopics" @change="handleTopicsChange">
                    <el-checkbox v-for="(topic, index) in availableTopics" :key="topic.name"
                        :id="`threed-topic-${index}`" :label="topic.name">
                        {{ topic.name }}
                    </el-checkbox>
                </el-checkbox-group>
            </div>
        </el-form>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElForm, ElFormItem, ElSwitch, ElColorPicker, ElCheckboxGroup, ElCheckbox } from 'element-plus'
import { use3DSettingsStore } from '@/stores/threeDSettings'
import { useRosStore } from '@/stores/ros'
import { computed } from 'vue'

const settingsStore = use3DSettingsStore()
const rosStore = useRosStore()

const showGrid = ref(settingsStore.showGrid)
const showAxes = ref(settingsStore.showAxes)
const backgroundColor = ref(settingsStore.backgroundColor)
const visibleTopics = ref<string[]>(settingsStore.visibleTopics)

const availableTopics = computed(() => {
    // 过滤出3D相关的话题
    return rosStore.topics.filter((t: { messageType: string }) =>
        t.messageType.includes('PointCloud') ||
        t.messageType.includes('Marker') ||
        t.messageType.includes('TF') ||
        t.messageType.includes('Path') ||
        t.messageType.includes('Pose')
    )
})

const handleGridChange = (value: string | number | boolean) => {
    settingsStore.setShowGrid(value as boolean)
}

const handleAxesChange = (value: string | number | boolean) => {
    settingsStore.setShowAxes(value as boolean)
}

const handleColorChange = (value: string | null) => {
    if (value) {
        settingsStore.setBackgroundColor(value)
    }
}

const handleTopicsChange = (value: (string | number | boolean)[]) => {
    settingsStore.setVisibleTopics(value as string[])
}

// 同步 store 变化
watch(() => settingsStore.showGrid, (val) => { showGrid.value = val })
watch(() => settingsStore.showAxes, (val) => { showAxes.value = val })
watch(() => settingsStore.backgroundColor, (val) => { backgroundColor.value = val })
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

.empty-hint {
    font-size: 12px;
    color: #999;
    padding: 8px 0;
}

.el-checkbox {
    display: flex;
    margin-bottom: 8px;
}

:deep(.el-form-item) {
    margin-bottom: 16px;
}

:deep(.el-form-item__label) {
    font-size: 12px;
    color: #666;
    font-weight: 500;
}
</style>
