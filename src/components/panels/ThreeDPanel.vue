<template>
    <div class="three-d-panel">
        <div ref="canvasContainer" class="canvas-container"></div>
        <div class="map-controls">
            <el-button size="small" @click="fitMapToView" title="适应地图">
                <el-icon>
                    <FullScreen />
                </el-icon>
            </el-button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { ElButton, ElIcon, ElMessage } from 'element-plus'
import { FullScreen } from '@element-plus/icons-vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { use3DSettingsStore } from '@/stores/threeDSettings'
import { useRosStore } from '@/stores/ros'
import { rosConnection } from '@/services/rosConnection'
import { createMapPlane, updateMapPlane } from '@/utils/threeUtils'
import { PublishClickTool, type PublishClickType } from '@/utils/PublishClickTool'
import { makePointMessage, makePoseMessage, makePoseEstimateMessage } from '@/utils/publishUtils'

const settingsStore = use3DSettingsStore()
const rosStore = useRosStore()
const canvasContainer = ref<HTMLDivElement>()
const publishActive = ref(false)

let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let controls: OrbitControls
let gridHelper: THREE.GridHelper
let animationId: number
let mapMesh: THREE.Mesh | null = null
let publishTool: PublishClickTool | null = null
let raycaster: THREE.Raycaster | null = null
let mouse: THREE.Vector2 | null = null
let mapSubscriptionTimer: number | null = null
let hasReceivedMapData = false
let currentMapData: any = null

const initThreeJS = () => {
    if (!canvasContainer.value) return

    // 创建场景
    scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf0f0f0)

    // 创建相机
    const width = canvasContainer.value.clientWidth
    const height = canvasContainer.value.clientHeight
    camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)

    // 根据视图模式设置相机位置
    if (settingsStore.viewMode === '2d') {
        camera.position.set(0, 0, 20)
        camera.lookAt(0, 0, 0)
    } else {
        camera.position.set(10, 10, 10)
        camera.lookAt(0, 0, 0)
    }

    // 创建渲染器
    renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(window.devicePixelRatio)
    canvasContainer.value.appendChild(renderer.domElement)

    // 添加轨道控制器
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05

    // 2D模式下限制旋转
    if (settingsStore.viewMode === '2d') {
        controls.enableRotate = false
    }

    // 添加网格 (旋转到XY平面)
    gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xdddddd)
    gridHelper.rotation.x = Math.PI / 2  // 旋转到XY平面
    if (settingsStore.showGrid) {
        scene.add(gridHelper)
    }

    // 添加坐标轴
    if (settingsStore.showAxes) {
        if (settingsStore.viewMode === '2d') {
            // 2D模式只显示XY轴
            const axesGroup = new THREE.Group()
            axesGroup.name = 'axes'

            // X轴 (红色)
            const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(5, 0, 0)
            ])
            const xAxisMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 })
            const xAxis = new THREE.Line(xAxisGeometry, xAxisMaterial)
            axesGroup.add(xAxis)

            // Y轴 (绿色)
            const yAxisGeometry = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(0, 5, 0)
            ])
            const yAxisMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 })
            const yAxis = new THREE.Line(yAxisGeometry, yAxisMaterial)
            axesGroup.add(yAxis)

            scene.add(axesGroup)
        } else {
            // 3D模式显示完整坐标轴
            const axesHelper = new THREE.AxesHelper(5)
            axesHelper.name = 'axes'
            scene.add(axesHelper)
        }
    }

    // 添加光源
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5)
    directionalLight.position.set(10, 10, 10)
    scene.add(directionalLight)

    // 初始化发布工具
    initPublishTool()

    // 如果已经连接，立即订阅话题（否则由watch处理）
    if (rosConnection.isConnected()) {
        subscribeToMap()
        subscribeToFootprint()
        subscribeToPlan()
        subscribeToMarkers()
    }

    // 初始化Raycaster用于鼠标拾取
    raycaster = new THREE.Raycaster()
    mouse = new THREE.Vector2()

    // 添加鼠标事件监听
    renderer.domElement.addEventListener('mousemove', handleMouseMove)
    renderer.domElement.addEventListener('click', handleMouseClick)

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

// 订阅地图话题
const subscribeToMap = async () => {
    if (!rosConnection.isConnected()) {
        console.warn('ROS未连接，无法订阅地图话题')
        return
    }

    try {
        // 检查可用的话题列表
        console.log('检查可用话题列表...')
        const topics = await rosConnection.getTopics()
        const mapTopic = topics.find(t => t.name === '/map')
        if (mapTopic) {
            console.log('找到地图话题:', mapTopic)
        } else {
            console.warn('警告: /map 话题不存在，可用话题:', topics.map(t => t.name).join(', '))
        }

        // 先取消订阅（如果已存在）
        rosConnection.unsubscribe('/map')
        hasReceivedMapData = false

        console.log('开始订阅地图话题 /map (nav_msgs/OccupancyGrid)')
        await rosConnection.subscribe({
            topic: '/map',
            messageType: 'nav_msgs/OccupancyGrid',
            callback: (message: any) => {
                console.log('✅ 收到地图数据:', {
                    width: message?.info?.width,
                    height: message?.info?.height,
                    resolution: message?.info?.resolution,
                    dataLength: message?.data?.length
                })
                hasReceivedMapData = true
                handleMapMessage(message)
            }
        })
        console.log('✅ 地图话题订阅成功，等待数据...')

        // 启动定期检查机制：如果10秒内没有收到数据，重新订阅
        if (mapSubscriptionTimer) {
            clearInterval(mapSubscriptionTimer)
        }
        mapSubscriptionTimer = window.setInterval(() => {
            if (!hasReceivedMapData && rosConnection.isConnected()) {
                console.log('⚠️ 未收到地图数据，尝试重新订阅...')
                subscribeToMap()
            } else if (hasReceivedMapData) {
                console.log('✅ 地图数据接收正常')
            }
        }, 10000) // 每10秒检查一次
    } catch (error) {
        console.error('❌ 订阅地图话题失败:', error)
    }
}

// 处理地图消息
const handleMapMessage = (message: any) => {
    if (!scene) {
        console.warn('❌ 场景未初始化，无法处理地图消息')
        return
    }

    try {
        console.log('📍 处理地图消息:', {
            width: message?.info?.width,
            height: message?.info?.height,
            resolution: message?.info?.resolution,
            origin: message?.info?.origin,
            dataLength: message?.data?.length
        })

        // 保存地图数据
        currentMapData = message

        if (mapMesh) {
            // 更新现有地图
            console.log('🔄 更新现有地图')
            updateMapPlane(mapMesh, message)
        } else {
            // 创建新地图
            console.log('🆕 创建新地图')
            mapMesh = createMapPlane(message)
            if (mapMesh) {
                scene.add(mapMesh)
                console.log('✅ 地图已添加到场景')
                // 自动调整相机以适应地图
                fitCameraToMap(message)
            } else {
                console.error('❌ 创建地图网格失败')
            }
        }
    } catch (error) {
        console.error('❌ 处理地图消息失败:', error)
        console.error('消息内容:', message)
    }
}

// 订阅footprint话题
let footprintLine: THREE.Line | null = null
const subscribeToFootprint = async () => {
    if (!rosConnection.isConnected()) return

    try {
        // 先取消订阅（如果已存在）
        rosConnection.unsubscribe('/move_base/global_costmap/footprint')

        await rosConnection.subscribe({
            topic: '/move_base/global_costmap/footprint',
            messageType: 'geometry_msgs/PolygonStamped',
            callback: (message: any) => {
                handleFootprintMessage(message)
            }
        })
    } catch (error) {
        console.error('订阅footprint话题失败:', error)
    }
}

// 处理footprint消息
const handleFootprintMessage = (message: any) => {
    if (!scene) return

    try {
        // 移除旧的footprint
        if (footprintLine) {
            scene.remove(footprintLine)
            footprintLine.geometry.dispose()
            if (footprintLine.material instanceof THREE.Material) {
                footprintLine.material.dispose()
            }
        }

        // 创建新的footprint线
        const points: THREE.Vector3[] = []
        if (message.polygon && message.polygon.points) {
            message.polygon.points.forEach((point: any) => {
                points.push(new THREE.Vector3(point.x, point.y, 0.01))
            })
            // 闭合多边形
            if (points.length > 0) {
                points.push(points[0].clone())
            }
        }

        if (points.length > 1) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points)
            const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
            footprintLine = new THREE.Line(geometry, material)
            scene.add(footprintLine)
        }
    } catch (error) {
        console.error('处理footprint消息失败:', error)
    }
}

// 订阅plan话题
let planLine: THREE.Line | null = null
const subscribeToPlan = async () => {
    if (!rosConnection.isConnected()) return

    try {
        // 先取消订阅（如果已存在）
        rosConnection.unsubscribe('/move_base/GlobalPlanner/plan')

        await rosConnection.subscribe({
            topic: '/move_base/GlobalPlanner/plan',
            messageType: 'nav_msgs/Path',
            callback: (message: any) => {
                handlePlanMessage(message)
            }
        })
    } catch (error) {
        console.error('订阅plan话题失败:', error)
    }
}

// 处理plan消息
const handlePlanMessage = (message: any) => {
    if (!scene) return

    try {
        // 移除旧的plan
        if (planLine) {
            scene.remove(planLine)
            planLine.geometry.dispose()
            if (planLine.material instanceof THREE.Material) {
                planLine.material.dispose()
            }
        }

        // 创建新的plan路径线
        const points: THREE.Vector3[] = []
        if (message.poses && Array.isArray(message.poses)) {
            message.poses.forEach((poseStamped: any) => {
                if (poseStamped.pose && poseStamped.pose.position) {
                    const pos = poseStamped.pose.position
                    points.push(new THREE.Vector3(pos.x, pos.y, 0.02))
                }
            })
        }

        if (points.length > 1) {
            const geometry = new THREE.BufferGeometry().setFromPoints(points)
            const material = new THREE.LineBasicMaterial({ color: 0xff00ff, linewidth: 2 })
            planLine = new THREE.Line(geometry, material)
            scene.add(planLine)
        }
    } catch (error) {
        console.error('处理plan消息失败:', error)
    }
}

// 订阅markers话题
let markerObjects: THREE.Object3D[] = []
const subscribeToMarkers = async () => {
    if (!rosConnection.isConnected()) return

    try {
        // 先取消订阅（如果已存在）
        rosConnection.unsubscribe('/goal_queue/markers')

        await rosConnection.subscribe({
            topic: '/goal_queue/markers',
            messageType: 'visualization_msgs/MarkerArray',
            callback: (message: any) => {
                handleMarkersMessage(message)
            }
        })
    } catch (error) {
        console.error('订阅markers话题失败:', error)
    }
}

// 处理markers消息
const handleMarkersMessage = (message: any) => {
    if (!scene) return

    try {
        // 移除旧的markers
        markerObjects.forEach(obj => {
            scene.remove(obj)
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose()
                if (obj.material instanceof THREE.Material) {
                    obj.material.dispose()
                }
            }
        })
        markerObjects = []

        // 创建新的markers
        if (message.markers && Array.isArray(message.markers)) {
            message.markers.forEach((marker: any) => {
                if (marker.action === 0 || marker.action === undefined) { // ADD/MODIFY
                    const markerObj = createMarker(marker)
                    if (markerObj) {
                        scene.add(markerObj)
                        markerObjects.push(markerObj)
                    }
                }
            })
        }
    } catch (error) {
        console.error('处理markers消息失败:', error)
    }
}

// 创建单个marker对象
const createMarker = (marker: any): THREE.Object3D | null => {
    if (!marker.pose || !marker.pose.position) return null

    const pos = marker.pose.position
    const orient = marker.pose.orientation || { x: 0, y: 0, z: 0, w: 1 }

    // 根据marker类型创建不同的几何体
    switch (marker.type) {
        case 0: // ARROW
        case 1: // CUBE
        case 2: // SPHERE
        case 3: // CYLINDER
            return createShapeMarker(marker, pos, orient)
        case 4: // LINE_STRIP
        case 5: // LINE_LIST
            return createLineMarker(marker)
        case 7: // SPHERE_LIST
            return createSphereListMarker(marker)
        case 8: // POINTS
            return createPointsMarker(marker)
        default:
            return createDefaultMarker(marker, pos)
    }
}

// 创建形状marker（球体、立方体等）
const createShapeMarker = (marker: any, pos: any, orient: any): THREE.Object3D => {
    let geometry: THREE.BufferGeometry

    switch (marker.type) {
        case 2: // SPHERE
            const radius = marker.scale ? marker.scale.x / 2 : 0.1
            geometry = new THREE.SphereGeometry(radius, 16, 16)
            break
        case 1: // CUBE
            const sx = marker.scale?.x || 0.1
            const sy = marker.scale?.y || 0.1
            const sz = marker.scale?.z || 0.1
            geometry = new THREE.BoxGeometry(sx, sy, sz)
            break
        default:
            geometry = new THREE.SphereGeometry(0.1, 16, 16)
    }

    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)
    const opacity = marker.color?.a !== undefined ? marker.color.a : 1.0

    const material = new THREE.MeshBasicMaterial({
        color,
        transparent: opacity < 1.0,
        opacity
    })
    const mesh = new THREE.Mesh(geometry, material)

    mesh.position.set(pos.x, pos.y, pos.z)

    // 应用方向（四元数）
    mesh.quaternion.set(orient.x, orient.y, orient.z, orient.w)

    return mesh
}

// 创建线条marker
const createLineMarker = (marker: any): THREE.Object3D | null => {
    if (!marker.points || marker.points.length < 2) return null

    const points: THREE.Vector3[] = marker.points.map((p: any) =>
        new THREE.Vector3(p.x, p.y, p.z)
    )

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)
    const material = new THREE.LineBasicMaterial({ color })

    return marker.type === 4 ?
        new THREE.Line(geometry, material) :
        new THREE.LineSegments(geometry, material)
}

// 创建球体列表marker
const createSphereListMarker = (marker: any): THREE.Object3D | null => {
    if (!marker.points || marker.points.length === 0) return null

    const group = new THREE.Group()
    const radius = marker.scale ? marker.scale.x / 2 : 0.05
    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)

    marker.points.forEach((p: any) => {
        const geometry = new THREE.SphereGeometry(radius, 8, 8)
        const material = new THREE.MeshBasicMaterial({ color })
        const sphere = new THREE.Mesh(geometry, material)
        sphere.position.set(p.x, p.y, p.z)
        group.add(sphere)
    })

    return group
}

// 创建点云marker
const createPointsMarker = (marker: any): THREE.Object3D | null => {
    if (!marker.points || marker.points.length === 0) return null

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(marker.points.length * 3)

    marker.points.forEach((p: any, i: number) => {
        positions[i * 3] = p.x
        positions[i * 3 + 1] = p.y
        positions[i * 3 + 2] = p.z
    })

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)
    const material = new THREE.PointsMaterial({
        color,
        size: marker.scale?.x || 0.05
    })

    return new THREE.Points(geometry, material)
}

// 创建默认marker（简单球体）
const createDefaultMarker = (marker: any, pos: any): THREE.Object3D => {
    const geometry = new THREE.SphereGeometry(0.1, 16, 16)
    const color = marker.color ?
        new THREE.Color(marker.color.r, marker.color.g, marker.color.b) :
        new THREE.Color(0xff0000)
    const material = new THREE.MeshBasicMaterial({ color })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(pos.x, pos.y, pos.z)
    return mesh
}

// 调整相机以适应地图
const fitCameraToMap = (mapData: any) => {
    const { width, height, resolution, origin } = mapData.info
    const mapWidth = width * resolution
    const mapHeight = height * resolution

    const centerX = origin.position.x + mapWidth / 2
    const centerY = origin.position.y + mapHeight / 2

    if (settingsStore.viewMode === '2d') {
        // 2D视图：从正上方俯视
        const maxDim = Math.max(mapWidth, mapHeight)
        camera.position.set(centerX, centerY, maxDim * 0.8)
        camera.lookAt(centerX, centerY, 0)
    } else {
        // 3D视图：倾斜角度
        const maxDim = Math.max(mapWidth, mapHeight)
        camera.position.set(centerX + maxDim * 0.5, centerY + maxDim * 0.5, maxDim * 0.5)
        camera.lookAt(centerX, centerY, 0)
    }

    controls.target.set(centerX, centerY, 0)
    controls.update()
}

// 适应地图到视图（供按钮调用）
const fitMapToView = () => {
    if (!currentMapData) {
        ElMessage.warning('未加载地图数据')
        return
    }
    fitCameraToMap(currentMapData)
    ElMessage.success('视角已适应地图')
}

// 初始化发布工具
const initPublishTool = () => {
    if (!scene) return

    publishTool = new PublishClickTool(scene)
    publishTool.setPublishType(settingsStore.publishType)

    // 设置发布回调
    publishTool.onPublish((event) => {
        handlePublishEvent(event)
    })

    // 设置状态变化回调
    publishTool.onStateChange((active) => {
        publishActive.value = active
    })
}

// 处理鼠标移动
const handleMouseMove = (event: MouseEvent) => {
    if (!canvasContainer.value || !publishTool?.isActive()) return

    const rect = canvasContainer.value.getBoundingClientRect()
    mouse!.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse!.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    const worldPoint = getWorldPoint(mouse!)
    publishTool.handleMouseMove(worldPoint)
}

// 处理鼠标点击
const handleMouseClick = (event: MouseEvent) => {
    if (!canvasContainer.value || !publishTool?.isActive()) return

    const rect = canvasContainer.value.getBoundingClientRect()
    mouse!.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse!.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    const worldPoint = getWorldPoint(mouse!)
    publishTool.handleClick(worldPoint)
}

// 获取鼠标在世界坐标中的位置
const getWorldPoint = (mouseCoords: THREE.Vector2): THREE.Vector3 | null => {
    if (!raycaster || !camera || !scene) return null

    raycaster.setFromCamera(mouseCoords, camera)

    // 如果有地图，与地图相交
    if (mapMesh) {
        const intersects = raycaster.intersectObject(mapMesh)
        if (intersects.length > 0) {
            return intersects[0].point
        }
    }

    // 否则与z=0平面相交
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const worldPoint = new THREE.Vector3()
    raycaster.ray.intersectPlane(plane, worldPoint)
    return worldPoint
}

// 处理发布事件
const handlePublishEvent = async (event: { type: PublishClickType; point?: any; pose?: any }) => {
    if (!rosConnection.isConnected()) {
        ElMessage.warning('ROS未连接')
        return
    }

    try {
        const frameId = 'map' // 使用地图坐标系

        switch (event.type) {
            case 'point': {
                const message = makePointMessage(event.point, frameId)
                await rosConnection.publish(
                    settingsStore.publishPointTopic,
                    'geometry_msgs/PointStamped',
                    message
                )
                ElMessage.success('发布成功')
                break
            }
            case 'pose': {
                const message = makePoseMessage(event.pose, frameId)
                await rosConnection.publish(
                    settingsStore.publishPoseTopic,
                    'geometry_msgs/PoseStamped',
                    message
                )
                ElMessage.success('发布成功')
                break
            }
            case 'pose_estimate': {
                const message = makePoseEstimateMessage(
                    event.pose,
                    frameId,
                    settingsStore.poseEstimateXDeviation,
                    settingsStore.poseEstimateYDeviation,
                    settingsStore.poseEstimateThetaDeviation
                )
                await rosConnection.publish(
                    settingsStore.publishPoseEstimateTopic,
                    'geometry_msgs/PoseWithCovarianceStamped',
                    message
                )
                ElMessage.success('发布成功')
                break
            }
        }
    } catch (error) {
        console.error('发布失败:', error)
        ElMessage.error('发布失败: ' + (error instanceof Error ? error.message : '未知错误'))
    }
}

// 处理发布命令
const handlePublishCommand = (command: PublishClickType) => {
    settingsStore.setPublishType(command)
    publishTool?.setPublishType(command)

    // 切换发布状态
    if (publishTool?.isActive()) {
        publishTool.stop()
    } else {
        publishTool?.start()
    }
}

const resetCamera = () => {
    if (settingsStore.viewMode === '2d') {
        camera.position.set(0, 0, 20)
        camera.lookAt(0, 0, 0)
        controls.target.set(0, 0, 0)
    } else {
        camera.position.set(10, 10, 10)
        camera.lookAt(0, 0, 0)
        controls.target.set(0, 0, 0)
    }
    controls.update()
}

// 暴露方法供设置面板调用
defineExpose({
    resetCamera,
    handlePublishCommand
})

// 监听设置变化
watch(() => settingsStore.backgroundColor, (color) => {
    if (scene) {
        scene.background = new THREE.Color(color)
    }
})

// 监听ROS连接状态，连接成功后订阅话题
watch(() => rosStore.isConnected, (connected) => {
    console.log('🔌 ThreeDPanel - ROS连接状态变化:', connected ? '已连接' : '未连接', 'scene是否初始化:', !!scene)
    if (connected && scene) {
        console.log('🗺️ ThreeDPanel - 开始订阅所有话题')
        // 连接成功后订阅所有话题
        subscribeToMap()
        subscribeToFootprint()
        subscribeToPlan()
        subscribeToMarkers()
    } else if (connected && !scene) {
        console.warn('⚠️ ThreeDPanel - ROS已连接但场景未初始化，等待场景初始化后再订阅')
    }
}, { immediate: true })

onMounted(() => {
    console.log('🎬 ThreeDPanel - 组件已挂载，初始化Three.js场景')
    initThreeJS()

    // 如果此时ROS已经连接，立即订阅
    if (rosStore.isConnected && scene) {
        console.log('🗺️ ThreeDPanel - 场景初始化完成且ROS已连接，立即订阅话题')
        subscribeToMap()
        subscribeToFootprint()
        subscribeToPlan()
        subscribeToMarkers()
    }
})

onUnmounted(() => {
    // 清理定时器
    if (mapSubscriptionTimer) {
        clearInterval(mapSubscriptionTimer)
        mapSubscriptionTimer = null
    }

    // 取消订阅地图话题
    if (rosConnection.isConnected()) {
        rosConnection.unsubscribe('/map')
    }

    // 清理发布工具
    if (publishTool) {
        publishTool.dispose()
        publishTool = null
    }

    // 移除鼠标事件监听
    if (renderer) {
        renderer.domElement.removeEventListener('mousemove', handleMouseMove)
        renderer.domElement.removeEventListener('click', handleMouseClick)
    }

    // 取消订阅
    rosConnection.unsubscribe('/map')
    rosConnection.unsubscribe('/move_base/global_costmap/footprint')
    rosConnection.unsubscribe('/move_base/GlobalPlanner/plan')
    rosConnection.unsubscribe('/goal_queue/markers')

    // 清理footprint和plan
    if (footprintLine) {
        footprintLine.geometry.dispose()
        if (footprintLine.material instanceof THREE.Material) {
            footprintLine.material.dispose()
        }
        scene?.remove(footprintLine)
        footprintLine = null
    }

    if (planLine) {
        planLine.geometry.dispose()
        if (planLine.material instanceof THREE.Material) {
            planLine.material.dispose()
        }
        scene?.remove(planLine)
        planLine = null
    }

    // 清理地图网格
    if (mapMesh) {
        if (mapMesh.geometry) {
            mapMesh.geometry.dispose()
        }
        if (mapMesh.material) {
            const material = mapMesh.material as THREE.MeshBasicMaterial
            if (material.map) {
                material.map.dispose()
            }
            material.dispose()
        }
        scene?.remove(mapMesh)
        mapMesh = null
    }

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

.map-controls {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 100;
}

.map-controls .el-button {
    background-color: rgba(255, 255, 255, 0.95);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.map-controls .el-button:hover {
    background-color: #ecf5ff;
    border-color: #409eff;
    color: #409eff;
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
