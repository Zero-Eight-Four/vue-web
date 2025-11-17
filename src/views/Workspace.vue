<template>
    <div class="workspace">
        <!-- Top App Bar -->
        <div class="app-bar">
            <div class="app-title">ROS Visualization</div>
            <div class="app-bar-actions">
                <el-button v-if="!isConnected" type="primary" size="small" @click="showConnectionDialog = true">
                    连接
                </el-button>
                <div v-else class="connection-status">
                    <span class="status-dot connected"></span>
                    <span>已连接</span>
                    <el-button size="small" @click="handleDisconnect">断开</el-button>
                </div>
            </div>
        </div>

        <!-- Main Content -->
        <div class="workspace-content">
            <!-- Left Sidebar -->
            <div class="sidebar sidebar-left">
                <div v-for="panel in panels" :key="panel.id" class="sidebar-item"
                    :class="{ active: currentPanel === panel.id }" @click="currentPanel = panel.id">
                    <component :is="panel.icon" class="sidebar-icon" />
                    <span class="sidebar-label">{{ panel.label }}</span>
                </div>
            </div>

            <!-- Center Panel Area -->
            <div class="panel-area">
                <component :is="currentPanelComponent" />
            </div>

            <!-- Right Sidebar -->
            <div class="sidebar sidebar-right">
                <div class="sidebar-header">
                    <h3>{{ currentPanelSettings.title }}</h3>
                    <el-button v-if="currentPanelSettings.showMinimize" text
                        @click="rightSidebarCollapsed = !rightSidebarCollapsed">
                        <el-icon>
                            <component :is="rightSidebarCollapsed ? 'ArrowLeft' : 'ArrowRight'" />
                        </el-icon>
                    </el-button>
                </div>

                <div v-if="!rightSidebarCollapsed" class="sidebar-content">
                    <component :is="currentPanelSettings.component" />
                </div>
            </div>
        </div>

        <!-- Connection Dialog -->
        <ConnectionDialog v-model="showConnectionDialog" @connected="onConnected" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, markRaw, h } from 'vue'
import { ElButton, ElIcon, ElMessage } from 'element-plus'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import ConnectionDialog from '@/components/ConnectionDialog.vue'
import ThreeDPanel from '@/components/panels/ThreeDPanel.vue'
import ImagePanel from '@/components/panels/ImagePanel.vue'
import ThreeDSettings from '@/components/settings/ThreeDSettings.vue'
import ImageSettings from '@/components/settings/ImageSettings.vue'

// Icons - using functional components to avoid runtime compilation
const ThreeDIcon = markRaw({
    setup() {
        return () => h('div', { style: 'font-size: 20px;' }, '🎮')
    }
})
const ImageIcon = markRaw({
    setup() {
        return () => h('div', { style: 'font-size: 20px;' }, '📷')
    }
})

const rosStore = useRosStore()
const isConnected = computed(() => rosStore.isConnected)

const showConnectionDialog = ref(false)
const currentPanel = ref('3d')
const rightSidebarCollapsed = ref(false)

interface Panel {
    id: string
    label: string
    icon: any
    component: any
    settingsComponent: any
    settingsTitle: string
}

const panels: Panel[] = [
    {
        id: '3d',
        label: '3D',
        icon: ThreeDIcon,
        component: markRaw(ThreeDPanel),
        settingsComponent: markRaw(ThreeDSettings),
        settingsTitle: '3D 设置'
    },
    {
        id: 'image',
        label: '图像',
        icon: ImageIcon,
        component: markRaw(ImagePanel),
        settingsComponent: markRaw(ImageSettings),
        settingsTitle: '图像设置'
    }
]

const currentPanelComponent = computed(() => {
    const panel = panels.find(p => p.id === currentPanel.value)
    return panel?.component
})

const currentPanelSettings = computed(() => {
    const panel = panels.find(p => p.id === currentPanel.value)
    return {
        title: panel?.settingsTitle || '',
        component: panel?.settingsComponent,
        showMinimize: true
    }
})

const handleDisconnect = () => {
    rosConnection.disconnect()
    rosStore.setConnectionState({ connected: false, connecting: false })
    ElMessage.info('已断开连接')
}

const onConnected = () => {
    ElMessage.success('连接成功')
}
</script>

<style scoped>
.workspace {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #f5f5f5;
}

.app-bar {
    height: 48px;
    background-color: #ffffff;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.app-title {
    font-size: 16px;
    font-weight: 600;
    color: #333;
}

.app-bar-actions {
    display: flex;
    align-items: center;
    gap: 12px;
}

.connection-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    background-color: #f0f9ff;
    border-radius: 4px;
    font-size: 13px;
}

.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.status-dot.connected {
    background-color: #52c41a;
}

.workspace-content {
    flex: 1;
    display: flex;
    overflow: hidden;
}

.sidebar {
    background-color: #ffffff;
    border-right: 1px solid #e0e0e0;
    display: flex;
    flex-direction: column;
}

.sidebar-left {
    width: 64px;
    padding: 8px 0;
}

.sidebar-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 12px 8px;
    cursor: pointer;
    transition: background-color 0.2s;
    color: #666;
}

.sidebar-item:hover {
    background-color: #f5f5f5;
}

.sidebar-item.active {
    background-color: #e6f7ff;
    color: #1890ff;
    border-right: 3px solid #1890ff;
}

.sidebar-icon {
    margin-bottom: 4px;
}

.sidebar-label {
    font-size: 11px;
    text-align: center;
}

.panel-area {
    flex: 1;
    background-color: #fafafa;
    overflow: hidden;
    position: relative;
}

.sidebar-right {
    width: 320px;
    border-left: 1px solid #e0e0e0;
    border-right: none;
}

.sidebar-header {
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.sidebar-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #333;
}

.sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
}
</style>
