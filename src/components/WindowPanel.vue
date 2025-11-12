<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  title: {
    type: String,
    required: true
  },
  defaultWidth: {
    type: Number,
    default: 400
  },
  defaultHeight: {
    type: Number,
    default: 300
  },
  defaultX: {
    type: Number,
    default: 0
  },
  defaultY: {
    type: Number,
    default: 0
  },
  resizable: {
    type: Boolean,
    default: true
  },
  minimizable: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['close', 'minimize'])

const windowRef = ref(null)
const isDragging = ref(false)
const isResizing = ref(false)
const isMinimized = ref(false)
const dragOffset = ref({ x: 0, y: 0 })
const position = ref({ x: props.defaultX, y: props.defaultY })
const size = ref({ width: props.defaultWidth, height: props.defaultHeight })
const resizeStart = ref({ x: 0, y: 0, width: 0, height: 0 })

const startDrag = (e) => {
  if (isMinimized.value) return
  isDragging.value = true
  const rect = windowRef.value.getBoundingClientRect()
  dragOffset.value = {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  }
  document.addEventListener('mousemove', handleDrag)
  document.addEventListener('mouseup', stopDrag)
  e.preventDefault()
}

const handleDrag = (e) => {
  if (!isDragging.value) return
  position.value = {
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y
  }
}

const stopDrag = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', handleDrag)
  document.removeEventListener('mouseup', stopDrag)
}

const startResize = (e) => {
  if (isMinimized.value || !props.resizable) return
  isResizing.value = true
  const rect = windowRef.value.getBoundingClientRect()
  resizeStart.value = {
    x: e.clientX,
    y: e.clientY,
    width: rect.width,
    height: rect.height
  }
  document.addEventListener('mousemove', handleResize)
  document.addEventListener('mouseup', stopResize)
  e.preventDefault()
  e.stopPropagation()
}

const handleResize = (e) => {
  if (!isResizing.value) return
  const deltaX = e.clientX - resizeStart.value.x
  const deltaY = e.clientY - resizeStart.value.y
  size.value = {
    width: Math.max(200, resizeStart.value.width + deltaX),
    height: Math.max(150, resizeStart.value.height + deltaY)
  }
}

const stopResize = () => {
  isResizing.value = false
  document.removeEventListener('mousemove', handleResize)
  document.removeEventListener('mouseup', stopResize)
}

const minimize = () => {
  isMinimized.value = !isMinimized.value
  emit('minimize', isMinimized.value)
}

onBeforeUnmount(() => {
  stopDrag()
  stopResize()
})
</script>

<template>
  <div
    ref="windowRef"
    class="window-panel"
    :class="{ minimized: isMinimized, dragging: isDragging, resizing: isResizing }"
    :style="{
      left: `${position.x}px`,
      top: `${position.y}px`,
      width: `${size.width}px`,
      height: isMinimized ? 'auto' : `${size.height}px`
    }"
  >
    <div class="window-header" @mousedown="startDrag">
      <span class="window-title">{{ title }}</span>
      <div class="window-controls">
        <button v-if="minimizable" class="control-btn minimize" @click="minimize" type="button">
          <span>−</span>
        </button>
        <button class="control-btn close" @click="$emit('close')" type="button">
          <span>×</span>
        </button>
      </div>
    </div>
    <div v-if="!isMinimized" class="window-content">
      <slot></slot>
    </div>
    <div
      v-if="resizable && !isMinimized"
      class="window-resize-handle"
      @mousedown="startResize"
    ></div>
  </div>
</template>

<style scoped>
.window-panel {
  position: absolute;
  background: #1e1e1e;
  border: 1px solid #3a3a3a;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10;
  user-select: none;
}

.window-panel.dragging {
  z-index: 1000;
}

.window-panel.minimized {
  height: auto !important;
}

.window-header {
  background: #2d2d2d;
  border-bottom: 1px solid #3a3a3a;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: move;
  flex-shrink: 0;
}

.window-title {
  font-size: 13px;
  font-weight: 500;
  color: #e0e0e0;
}

.window-controls {
  display: flex;
  gap: 4px;
}

.control-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #b0b0b0;
  cursor: pointer;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
  padding: 0;
  transition: background-color 0.15s;
}

.control-btn:hover {
  background: #3a3a3a;
}

.control-btn.close:hover {
  background: #e74c3c;
  color: white;
}

.window-content {
  flex: 1;
  overflow: auto;
  position: relative;
}

.window-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  background: linear-gradient(135deg, transparent 0%, transparent 40%, #4a4a4a 40%, #4a4a4a 50%, transparent 50%, transparent 60%, #4a4a4a 60%, #4a4a4a 100%);
}

.window-resize-handle:hover {
  background: linear-gradient(135deg, transparent 0%, transparent 40%, #5a5a5a 40%, #5a5a5a 50%, transparent 50%, transparent 60%, #5a5a5a 60%, #5a5a5a 100%);
}
</style>

