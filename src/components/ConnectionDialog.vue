<template>
    <el-dialog v-model="visible" title="连接到 ROS Bridge" width="500px" :close-on-click-modal="false">
        <el-form :model="form" label-width="100px">
            <el-form-item label="WebSocket URL" prop="url">
                <el-select id="ros-websocket-url" v-model="form.url" filterable allow-create
                    placeholder="ws://localhost:9090" style="width: 100%" @keyup.enter="handleConnect">
                    <el-option v-for="historyUrl in connectionHistory" :key="historyUrl" :label="historyUrl"
                        :value="historyUrl" />
                </el-select>
            </el-form-item>

            <el-form-item label="自动重连" prop="autoReconnect">
                <el-switch id="ros-auto-reconnect" v-model="form.autoReconnect" />
            </el-form-item>
        </el-form>

        <template #footer>
            <el-button @click="visible = false">
                取消
            </el-button>
            <el-button type="primary" :loading="connecting" @click="handleConnect">
                连接
            </el-button>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { ElDialog, ElForm, ElFormItem, ElSelect, ElOption, ElSwitch, ElButton, ElMessage } from 'element-plus'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'

const props = defineProps<{
    modelValue: boolean
}>()

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void
    (e: 'connected'): void
}>()

const rosStore = useRosStore()
const visible = ref(props.modelValue)
const connecting = ref(false)
const connectionHistory = ref<string[]>([])

const form = ref({
    url: 'ws://localhost:9090',
    autoReconnect: true
})

// 从 localStorage 加载连接历史
const loadConnectionHistory = () => {
    try {
        const history = localStorage.getItem('ros_connection_history')
        if (history) {
            connectionHistory.value = JSON.parse(history)
        }
    } catch (error) {
        console.error('Failed to load connection history:', error)
    }
}

// 保存连接历史
const saveConnectionHistory = (url: string) => {
    try {
        // 移除相同的URL(如果存在)
        const filtered = connectionHistory.value.filter(h => h !== url)
        // 添加到开头
        connectionHistory.value = [url, ...filtered].slice(0, 5) // 只保留最近5个
        localStorage.setItem('ros_connection_history', JSON.stringify(connectionHistory.value))
    } catch (error) {
        console.error('Failed to save connection history:', error)
    }
}

onMounted(() => {
    loadConnectionHistory()
})

watch(() => props.modelValue, (val) => {
    visible.value = val
    if (val) {
        form.value.url = rosStore.connectionState.url
    }
})

watch(visible, (val) => {
    emit('update:modelValue', val)
})

const handleConnect = async () => {
    connecting.value = true

    // 确保 url 是字符串类型(el-select allow-create 模式可能返回对象)
    const urlValue = typeof form.value.url === 'string'
        ? form.value.url
        : String(form.value.url)

    rosStore.setConnectionState({ connecting: true, error: null, url: urlValue })

    try {
        await rosConnection.connect({
            url: urlValue,
            autoConnect: form.value.autoReconnect
        })

        rosStore.setConnectionState({ connected: true, connecting: false })

        // 保存到连接历史
        saveConnectionHistory(urlValue)

        // 获取话题列表
        const topics = await rosConnection.getTopics()
        rosStore.setTopics(topics)

        ElMessage.success('成功连接到 ROS Bridge')
        visible.value = false
        emit('connected')
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误'
        rosStore.setConnectionState({
            connected: false,
            connecting: false,
            error: errorMessage
        })
        ElMessage.error('连接失败: ' + errorMessage)
    } finally {
        connecting.value = false
    }
}
</script>

<style scoped>
.el-dialog {
    border-radius: 8px;
}
</style>
