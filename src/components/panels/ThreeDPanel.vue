<template>
    <div class="three-d-panel">
        <div ref="canvasContainer" class="canvas-container"></div>
        <div class="panel-toolbar">
            <el-button size="small" @click="resetCamera">重置视角</el-button>
            <el-button size="small" @click="toggleGrid">{{ showGrid ? '隐藏' : '显示' }}网格</el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { ElButton } from 'element-plus'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { use3DSettingsStore } from '@/stores/threeDSettings'

const settingsStore = use3DSettingsStore()
const canvasContainer = ref<HTMLDivElement>()
const showGrid = ref(true)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let gridHelper: THREE.GridHelper
let animationId: number

const initThreeJS = () => {
    if (!canvasContainer.value) return

    // 创建场景
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf0f0f0)

    // 创建相机
    const width = canvasContainer.value.clientWidth
    const height = canvasContainer.value.clientHeight
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    camera.position.set(5, 5, 5)
    camera.lookAt(0, 0, 0)

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    canvasContainer.value.appendChild(renderer.domElement)

    // 添加轨道控制器
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    // 添加网格
    gridHelper = new THREE.GridHelper(10, 10, 0xcccccc, 0xdddddd)
    if (settingsStore.showGrid) {
        scene.add(gridHelper)
    }

    // 添加坐标轴
    if (settingsStore.showAxes) {
        const axesHelper = new THREE.AxesHelper(5)
        scene.add(axesHelper)
    }

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 10, 10)
    scene.add(directionalLight)

    // 添加示例立方体
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    const material = new THREE.MeshStandardMaterial({ color: 0x1890ff })
    const cube = new THREE.Mesh(geometry, material)
    cube.position.y = 0.5
    scene.add(cube)

    // 窗口大小调整
    const handleResize = () => {
        if (!canvasContainer.value) return
        const width = canvasContainer.value.clientWidth
        const height = canvasContainer.value.clientHeight
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    // 动画循环
    const animate = () => {
        animationId = requestAnimationFrame(animate)
        controls.update()
        renderer.render(scene, camera)
    }
    animate()
}

const resetCamera = () => {
    camera.position.set(5, 5, 5)
    camera.lookAt(0, 0, 0)
    controls.reset()
}

const toggleGrid = () => {
    showGrid.value = !showGrid.value
    settingsStore.setShowGrid(showGrid.value)
    if (showGrid.value) {
        scene.add(gridHelper)
    } else {
        scene.remove(gridHelper)
    }
}

// 监听设置变化
watch(() => settingsStore.backgroundColor, (color) => {
    if (scene) {
        scene.background = new THREE.Color(color)
    }
})

onMounted(() => {
    initThreeJS()
})

onUnmounted(() => {
    if (animationId) {
        cancelAnimationFrame(animationId)
    }
    if (renderer) {
        renderer.dispose()
    }
    window.removeEventListener('resize', () => { })
})
</script>

<style scoped>
.three-d-panel {
    width: 100%;
    height: 100%;
    position: relative;
    background-color: #fff;
}

.canvas-container {
    width: 100%;
    height: 100%;
}

.panel-toolbar {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 8px;
    background-color: rgba(255, 255, 255, 0.9);
    padding: 8px;
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}
</style>
