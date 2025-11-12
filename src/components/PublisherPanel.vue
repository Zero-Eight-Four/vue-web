<script setup>
import { ref, computed } from 'vue'
import ROSLIB from 'roslib'

const props = defineProps({
  ros: {
    type: Object,
    default: null
  },
  connected: {
    type: Boolean,
    default: false
  }
})

const publishers = ref([
  { name: '开始导航', topic: '/start_navigation', type: 'std_msgs/Empty' },
  { name: '停止导航', topic: '/stop_navigation', type: 'std_msgs/Empty' },
  { name: '重置', topic: '/reset', type: 'std_msgs/Empty' },
  { name: '紧急停止', topic: '/emergency_stop', type: 'std_msgs/Empty' },
  { name: '继续', topic: '/continue', type: 'std_msgs/Empty' },
  { name: '暂停', topic: '/pause', type: 'std_msgs/Empty' }
])

const customTopic = ref('')
const customType = ref('std_msgs/Empty')
const publishing = ref({})

const publishMessage = (topicName, messageType) => {
  if (!props.ros || !props.connected) {
    alert('未连接到 ROS')
    return
  }

  const key = `${topicName}_${messageType}`
  if (publishing.value[key]) return

  publishing.value[key] = true

  try {
    const topic = new ROSLIB.Topic({
      ros: props.ros,
      name: topicName,
      messageType: messageType
    })

    const message = new ROSLIB.Message({})
    topic.publish(message)

    setTimeout(() => {
      publishing.value[key] = false
    }, 500)
  } catch (error) {
    console.error('Error publishing message:', error)
    alert(`发布失败: ${error.message}`)
    publishing.value[key] = false
  }
}

const publishCustom = () => {
  if (!customTopic.value.trim()) {
    alert('请输入话题名称')
    return
  }
  publishMessage(customTopic.value.trim(), customType.value)
}

const addCustomPublisher = () => {
  if (!customTopic.value.trim()) {
    alert('请输入话题名称')
    return
  }
  publishers.value.push({
    name: customTopic.value.trim(),
    topic: customTopic.value.trim(),
    type: customType.value
  })
  customTopic.value = ''
}
</script>

<template>
  <div class="publisher-panel">
    <div class="publisher-section">
      <h3>预设话题</h3>
      <div class="button-grid">
        <button
          v-for="publisher in publishers"
          :key="`${publisher.topic}_${publisher.type}`"
          class="publish-btn"
          :class="{ publishing: publishing[`${publisher.topic}_${publisher.type}`] }"
          :disabled="!connected || publishing[`${publisher.topic}_${publisher.type}`]"
          @click="publishMessage(publisher.topic, publisher.type)"
        >
          {{ publisher.name }}
          <span class="topic-hint">{{ publisher.topic }}</span>
        </button>
      </div>
    </div>

    <div class="publisher-section">
      <h3>自定义发布</h3>
      <div class="custom-publisher">
        <div class="input-group">
          <label>话题名称</label>
          <input v-model="customTopic" type="text" placeholder="/your/topic" />
        </div>
        <div class="input-group">
          <label>消息类型</label>
          <select v-model="customType">
            <option value="std_msgs/Empty">std_msgs/Empty</option>
            <option value="std_msgs/String">std_msgs/String</option>
            <option value="std_msgs/Bool">std_msgs/Bool</option>
            <option value="std_msgs/Int32">std_msgs/Int32</option>
            <option value="geometry_msgs/Twist">geometry_msgs/Twist</option>
          </select>
        </div>
        <div class="button-row">
          <button
            class="publish-btn primary"
            :disabled="!connected || !customTopic.trim()"
            @click="publishCustom"
          >
            发布
          </button>
          <button
            class="publish-btn secondary"
            :disabled="!connected || !customTopic.trim()"
            @click="addCustomPublisher"
          >
            添加到预设
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.publisher-panel {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  height: 100%;
  overflow-y: auto;
}

.publisher-section h3 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
}

.button-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 8px;
}

.publish-btn {
  padding: 12px 16px;
  background: #2d2d2d;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #e0e0e0;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  position: relative;
}

.publish-btn:hover:not(:disabled) {
  background: #3a3a3a;
  border-color: #4a4a4a;
}

.publish-btn:active:not(:disabled) {
  background: #252525;
}

.publish-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.publish-btn.publishing {
  background: #1a4a1a;
  border-color: #2a6a2a;
}

.topic-hint {
  font-size: 11px;
  color: #888;
  font-family: monospace;
  font-weight: normal;
}

.custom-publisher {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.input-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.input-group label {
  font-size: 12px;
  color: #b0b0b0;
  font-weight: 500;
}

.input-group input,
.input-group select {
  padding: 8px 12px;
  background: #252525;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #e0e0e0;
  font-size: 13px;
  font-family: monospace;
}

.input-group input:focus,
.input-group select:focus {
  outline: none;
  border-color: #646cff;
}

.button-row {
  display: flex;
  gap: 8px;
}

.publish-btn.primary {
  background: #646cff;
  border-color: #646cff;
  color: white;
}

.publish-btn.primary:hover:not(:disabled) {
  background: #535bf2;
  border-color: #535bf2;
}

.publish-btn.secondary {
  background: #2d2d2d;
}
</style>

