import { defineStore } from 'pinia'
import { ref } from 'vue'

export const use3DSettingsStore = defineStore('threeDSettings', () => {
  // State
  const showGrid = ref(true)
  const showAxes = ref(true)
  const backgroundColor = ref('#f0f0f0')
  const visibleTopics = ref<string[]>([])

  // Actions
  function setShowGrid(value: boolean) {
    showGrid.value = value
  }

  function setShowAxes(value: boolean) {
    showAxes.value = value
  }

  function setBackgroundColor(color: string) {
    backgroundColor.value = color
  }

  function toggleTopicVisibility(topic: string) {
    const index = visibleTopics.value.indexOf(topic)
    if (index > -1) {
      visibleTopics.value.splice(index, 1)
    } else {
      visibleTopics.value.push(topic)
    }
  }

  function setVisibleTopics(topics: string[]) {
    visibleTopics.value = topics
  }

  return {
    showGrid,
    showAxes,
    backgroundColor,
    visibleTopics,
    setShowGrid,
    setShowAxes,
    setBackgroundColor,
    toggleTopicVisibility,
    setVisibleTopics
  }
})
