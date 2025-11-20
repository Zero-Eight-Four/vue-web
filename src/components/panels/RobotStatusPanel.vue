<template>
    <div class="robot-status-panel">
        <div class="status-header">
            <h3>机器狗状态</h3>
            <template v-if="isConnected">
                <el-tag type="success" size="small">
                    已连接
                </el-tag>
                <el-button size="small" @click="handleDisconnect">
                    切换
                </el-button>
            </template>
        </div>

        <!-- 未连接时只显示连接提示 -->
        <template v-if="!isConnected">
            <div class="connect-prompt">
                <div class="prompt-icon">
                    🤖
                </div>
                <p>请先连接到机器狗</p>
                <el-button type="primary" @click="showConnectionDialog = true">
                    立即连接
                </el-button>
            </div>
        </template>

        <!-- 连接后显示状态信息 -->
        <el-scrollbar v-else height="calc(100vh - 120px)">
            <div class="status-content">
                <template v-if="statusData">
                    <!-- 系统状态 -->
                    <div class="status-section">
                        <h4 class="section-title">
                            系统状态
                        </h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="label">状态:</span>
                                <span class="value">{{ getSystemFlagsText(statusData.system_flags) }}</span>
                            </div>
                            <div class="info-item">
                                <span class="label">核心温度:</span>
                                <span class="value">{{ (statusData.imu_temp || 0).toFixed(0) }}°C</span>
                            </div>
                            <div class="info-item">
                                <span class="label">主板温度:</span>
                                <span class="value">{{ (statusData.main_board_temp || 0).toFixed(0) }}°C</span>
                            </div>
                            <div class="info-item">
                                <span class="label">充电温度:</span>
                                <span class="value">{{ (statusData.charging_temp || 0).toFixed(0) }}°C</span>
                            </div>
                            <div class="info-item">
                                <span class="label">电机电流:</span>
                                <span class="value">{{ (statusData.motor_current || 0).toFixed(1) }}A</span>
                            </div>
                        </div>
                    </div>

                    <!-- 运动状态 -->
                    <div class="status-section">
                        <h4 class="section-title">
                            运动状态
                        </h4>
                        <div class="info-grid">
                            <div class="info-item">
                                <span class="label">位置:</span>
                                <span class="value">
                                    ({{ (statusData.position_x || 0).toFixed(2) }},
                                    {{ (statusData.position_y || 0).toFixed(2) }})m
                                </span>
                            </div>
                            <div class="info-item">
                                <span class="label">速度:</span>
                                <span class="value">{{ getTotalVelocity() }} m/s</span>
                            </div>
                        </div>
                    </div>

                    <!-- 电池状态 -->
                    <div class="status-section">
                        <h4 class="section-title">
                            电池状态
                        </h4>
                        <div class="battery-info">
                            <el-progress :percentage="batteryPercentage" :color="batteryColor" :stroke-width="20">
                                <span class="battery-text">{{ batteryPercentage }}%</span>
                            </el-progress>
                        </div>
                    </div>

                    <!-- 更新时间 -->
                    <div class="status-footer">
                        <span class="update-time">更新时间: {{ lastUpdateTime }}</span>
                    </div>
                </template>

                <template v-else>
                    <el-empty description="暂无数据" :image-size="100">
                        <template #image>
                            <div style="font-size: 48px">
                                🤖
                            </div>
                        </template>
                    </el-empty>
                </template>
            </div>
        </el-scrollbar>

        <!-- Connection Dialog -->
        <ConnectionDialog v-model="showConnectionDialog" @connected="onConnected" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { ElScrollbar, ElTag, ElProgress, ElEmpty, ElButton, ElMessage } from 'element-plus'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import ConnectionDialog from '@/components/ConnectionDialog.vue'
import type { RosMessage } from '@/types/ros'

const emit = defineEmits<{
    (e: 'switch-panel', panelId: string): void
}>()

const rosStore = useRosStore()
const showConnectionDialog = ref(false)

interface RobotStatus {
    // 电池信息
    battery_soc?: number
    battery_voltage?: number
    battery_current?: number
    battery_temp_avg?: number

    // 运动信息
    motion_mode?: string
    motion_gait?: string
    position_x?: number
    position_y?: number
    position_z?: number
    velocity_x?: number
    velocity_y?: number
    velocity_z?: number

    // IMU信息
    imu_temp?: number

    // 足部力
    foot_force_fr?: number
    foot_force_fl?: number
    foot_force_rr?: number
    foot_force_rl?: number

    // 系统状态
    system_flags?: string
    main_board_temp?: number
    charging_temp?: number
    reel_current?: number
    motor_current?: number
}

const statusData = ref<RobotStatus | null>(null)
const lastUpdateTime = ref<string>('--:--:--')
const isConnected = computed(() => rosStore.isConnected)

const handleDisconnect = () => {
    rosConnection.disconnect()
    rosStore.setConnectionState({ connected: false, connecting: false })
    ElMessage.info('已断开连接')
    showConnectionDialog.value = true
}

const onConnected = () => {
    ElMessage.success('连接成功')
    // 连接成功后切换到图像面板
    emit('switch-panel', 'image')
}

const batteryPercentage = computed(() => {
    return Math.round(statusData.value?.battery_soc || 0)
})

// 系统状态文本映射
const getSystemFlagsText = (flags?: string) => {
    if (!flags) return 'N/A'
    const flagMap: { [key: string]: string } = {
        'NotCharging': '未充电',
        'Charging': '充电中',
        'ChargingComplete': '充电完成',
        'BatteryLow': '电量低',
        'BatteryError': '电池错误',
        'MotorError': '电机错误',
        'Normal': '正常'
    }
    return flagMap[flags] || flags
}

// 计算总速度
const getTotalVelocity = () => {
    const vx = statusData.value?.velocity_x || 0
    const vy = statusData.value?.velocity_y || 0
    const vz = statusData.value?.velocity_z || 0
    return Math.sqrt(vx * vx + vy * vy + vz * vz).toFixed(2)
}

const batteryColor = computed(() => {
    const percentage = batteryPercentage.value
    if (percentage > 60) return '#67c23a'
    if (percentage > 30) return '#e6a23c'
    return '#f56c6c'
})

// 订阅状态话题
const subscribeToStatus = async () => {
    if (!rosConnection.isConnected()) {
        console.warn('ROS未连接，无法订阅状态话题')
        return
    }

    try {
        // 检查可用的话题列表
        console.log('检查可用话题列表...')
        const topics = await rosConnection.getTopics()
        const statusTopic = topics.find(t => t.name === '/go2/status')
        if (statusTopic) {
            console.log('✅ 找到状态话题:', statusTopic)
        } else {
            console.warn('⚠️ /go2/status 话题不存在，可用话题:', topics.map(t => t.name).join(', '))
        }

        console.log('开始订阅状态话题 /go2/status (std_msgs/String)')
        await rosConnection.subscribe({
            topic: '/go2/status',
            messageType: 'std_msgs/String',
            callback: (message: RosMessage) => {
                console.log('✅ 收到状态数据:', message)
                handleStatusMessage(message)
            }
        })
        console.log('✅ 状态话题订阅成功，等待数据...')
    } catch (error) {
        console.error('❌ 订阅状态话题失败:', error)
    }
}

// 解析字符串格式的状态数据
const parseStatusString = (statusString: string): RobotStatus => {
    const data: RobotStatus = {}

    // 按行分割
    const lines = statusString.split('\n')

    for (const line of lines) {
        const trimmedLine = line.trim()
        if (!trimmedLine || trimmedLine.startsWith('===')) continue

        // 解析包含管道符的行
        if (trimmedLine.includes('|')) {
            const parts = trimmedLine.split('|').map(p => p.trim())

            parts.forEach(part => {
                const colonIndex = part.indexOf(':')
                if (colonIndex === -1) return

                const key = part.substring(0, colonIndex).trim()
                const value = part.substring(colonIndex + 1).trim()

                switch (key) {
                    case 'SOC':
                        data.battery_soc = parseFloat(value.replace('%', ''))
                        break
                    case 'Temp': {
                        // 解析温度格式: "22°C/21°C"
                        const temps = value.split('/')
                        if (temps.length > 0) {
                            data.battery_temp_avg = parseFloat(temps[0].replace('°C', ''))
                        }
                        break
                    }
                    case 'Position(x,y,z)': {
                        const match = value.match(/\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/)
                        if (match) {
                            data.position_x = parseFloat(match[1])
                            data.position_y = parseFloat(match[2])
                            data.position_z = parseFloat(match[3])
                        }
                        break
                    }
                    case 'Velocity(vx,vy,vz)': {
                        const match = value.match(/\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/)
                        if (match) {
                            data.velocity_x = parseFloat(match[1])
                            data.velocity_y = parseFloat(match[2])
                            data.velocity_z = parseFloat(match[3])
                        }
                        break
                    }
                    case 'Flags':
                        data.system_flags = value
                        break
                    case 'Main Board Temp':
                        data.main_board_temp = parseFloat(value.replace('°C', ''))
                        break
                    case 'Charging Temp':
                        data.charging_temp = parseFloat(value.replace('°C', ''))
                        break
                    case 'Motor Current':
                        data.motor_current = parseFloat(value.replace('A', ''))
                        break
                }
            })
        } else {
            // 解析单行
            const colonIndex = trimmedLine.indexOf(':')
            if (colonIndex === -1) continue

            const key = trimmedLine.substring(0, colonIndex).trim()
            const value = trimmedLine.substring(colonIndex + 1).trim()

            switch (key) {
                case 'Temp':
                    data.imu_temp = parseFloat(value.replace('°C', ''))
                    break
            }
        }
    }

    return data
}

// 处理状态消息
const handleStatusMessage = (message: RosMessage) => {
    try {
        console.log('📥 处理状态消息，原始数据类型:', typeof message, message)
        let statusString: string

        if (typeof message === 'string') {
            statusString = message
            console.log('消息是字符串类型')
        } else if (message.data && typeof message.data === 'string') {
            // std_msgs/String 类型
            statusString = message.data
            console.log('消息是std_msgs/String类型，data字段:', statusString.substring(0, 100))
        } else {
            console.error('❌ 未知的消息格式:', message)
            return
        }

        // 解析字符串格式的状态数据
        console.log('🔍 开始解析状态字符串...')
        statusData.value = parseStatusString(statusString)
        lastUpdateTime.value = new Date().toLocaleTimeString()
        console.log('✅ 状态数据解析成功:', statusData.value)
    } catch (error) {
        console.error('❌ 解析状态消息失败:', error, message)
    }
}// 监听ROS连接状态，连接成功后订阅话题
watch(() => rosStore.isConnected, (connected) => {
    console.log('🔌 ROS连接状态变化:', connected ? '已连接' : '未连接')
    if (connected) {
        console.log('🤖 ROS已连接，准备订阅机器狗状态话题')
        subscribeToStatus()
    } else {
        console.log('⚠️ ROS已断开连接')
    }
}, { immediate: true })

onMounted(() => {
    // 如果已经连接，立即订阅
    if (rosStore.isConnected) {
        subscribeToStatus()
    }
})

onUnmounted(() => {
    if (rosConnection.isConnected()) {
        rosConnection.unsubscribe('/go2/status')
    }
})
</script>

<style scoped>
.robot-status-panel {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #fff;
}

.status-header {
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: #fafafa;
    gap: 8px;
}

.connect-prompt {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
}

.prompt-icon {
    font-size: 64px;
    margin-bottom: 16px;
}

.connect-prompt p {
    margin: 0 0 24px 0;
    color: #666;
    font-size: 14px;
}

.status-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #333;
}

.status-content {
    padding: 16px;
}

.status-section {
    margin-bottom: 20px;
    padding: 12px;
    background-color: #fafafa;
    border-radius: 6px;
    border: 1px solid #e8e8e8;
}

.section-title {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #1890ff;
    border-bottom: 1px solid #e0e0e0;
    padding-bottom: 8px;
}

.info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
}

.info-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.info-item .label {
    font-size: 12px;
    color: #666;
}

.info-item .value {
    font-size: 14px;
    font-weight: 500;
    color: #333;
}

.battery-info {
    padding: 8px 0;
}

.battery-text {
    font-weight: 600;
}

.status-footer {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid #e0e0e0;
    text-align: center;
}

.update-time {
    font-size: 12px;
    color: #999;
}
</style>
