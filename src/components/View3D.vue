<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import * as THREE from 'three'
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

const containerRef = ref(null)
let scene = null
let camera = null
let renderer = null
let animationId = null
let tfClient = null
let pathListener = null
let mapListener = null
let pointCloudListener = null
let resizeObserver = null

const paths = ref([])
const pointClouds = ref([])

const initThree = () => {
  if (!containerRef.value) return

  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1a1a)

  camera = new THREE.PerspectiveCamera(
    75,
    containerRef.value.clientWidth / containerRef.value.clientHeight,
    0.1,
    1000
  )
  camera.position.set(5, 5, 5)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(containerRef.value.clientWidth, containerRef.value.clientHeight)
  containerRef.value.appendChild(renderer.domElement)

  const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222)
  scene.add(gridHelper)

  const axesHelper = new THREE.AxesHelper(2)
  scene.add(axesHelper)

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
  scene.add(ambientLight)

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
  directionalLight.position.set(10, 10, 5)
  scene.add(directionalLight)

  const controls = {
    isRotating: false,
    isPanning: false,
    lastMouseX: 0,
    lastMouseY: 0
  }

  const onMouseDown = (e) => {
    if (e.button === 0) {
      controls.isRotating = true
      controls.lastMouseX = e.clientX
      controls.lastMouseY = e.clientY
    } else if (e.button === 2) {
      controls.isPanning = true
      controls.lastMouseX = e.clientX
      controls.lastMouseY = e.clientY
    }
  }

  const onMouseMove = (e) => {
    if (controls.isRotating) {
      const deltaX = e.clientX - controls.lastMouseX
      const deltaY = e.clientY - controls.lastMouseY
      const spherical = new THREE.Spherical()
      spherical.setFromVector3(camera.position)
      spherical.theta -= deltaX * 0.01
      spherical.phi += deltaY * 0.01
      spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi))
      camera.position.setFromSpherical(spherical)
      camera.lookAt(0, 0, 0)
      controls.lastMouseX = e.clientX
      controls.lastMouseY = e.clientY
    } else if (controls.isPanning) {
      const deltaX = e.clientX - controls.lastMouseX
      const deltaY = e.clientY - controls.lastMouseY
      const panVector = new THREE.Vector3()
      panVector.setFromMatrixColumn(camera.matrix, 0)
      panVector.multiplyScalar(-deltaX * 0.01)
      camera.position.add(panVector)
      panVector.setFromMatrixColumn(camera.matrix, 1)
      panVector.multiplyScalar(deltaY * 0.01)
      camera.position.add(panVector)
      controls.lastMouseX = e.clientX
      controls.lastMouseY = e.clientY
    }
  }

  const onMouseUp = () => {
    controls.isRotating = false
    controls.isPanning = false
  }

  const onWheel = (e) => {
    const delta = e.deltaY * 0.01
    const direction = new THREE.Vector3()
    camera.getWorldDirection(direction)
    camera.position.addScaledVector(direction, delta)
  }

  containerRef.value.addEventListener('mousedown', onMouseDown)
  containerRef.value.addEventListener('mousemove', onMouseMove)
  containerRef.value.addEventListener('mouseup', onMouseUp)
  containerRef.value.addEventListener('wheel', onWheel)
  containerRef.value.addEventListener('contextmenu', (e) => e.preventDefault())

  const animate = () => {
    animationId = requestAnimationFrame(animate)
    renderer.render(scene, camera)
  }
  animate()

  const handleResize = () => {
    if (!containerRef.value || !camera || !renderer) return
    const width = containerRef.value.clientWidth
    const height = containerRef.value.clientHeight
    if (width > 0 && height > 0) {
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
  }

  resizeObserver = new ResizeObserver(handleResize)
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
}

const subscribeToTopics = () => {
  if (!props.ros || !props.connected) return

  tfClient = new ROSLIB.TFClient({
    ros: props.ros,
    fixedFrame: 'map',
    angularThres: 0.01,
    transThres: 0.01
  })

  pathListener = new ROSLIB.Topic({
    ros: props.ros,
    name: '/path',
    messageType: 'nav_msgs/Path'
  })

  pathListener.subscribe((message) => {
    if (!scene) return
    const points = message.poses.map((pose) => {
      const pos = pose.pose.position
      return new THREE.Vector3(pos.x, pos.y, pos.z)
    })

    if (points.length > 0) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points)
      const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 })
      const line = new THREE.Line(geometry, material)
      scene.add(line)
      paths.value.push(line)
      if (paths.value.length > 5) {
        const oldPath = paths.value.shift()
        scene.remove(oldPath)
        oldPath.geometry.dispose()
        oldPath.material.dispose()
      }
    }
  })

  mapListener = new ROSLIB.Topic({
    ros: props.ros,
    name: '/map',
    messageType: 'nav_msgs/OccupancyGrid'
  })

  mapListener.subscribe((message) => {
    if (!scene) return
    const width = message.info.width
    const height = message.info.height
    const resolution = message.info.resolution
    const origin = message.info.origin.position

    const geometry = new THREE.PlaneGeometry(width * resolution, height * resolution)
    const data = new Uint8Array(width * height)
    for (let i = 0; i < message.data.length; i++) {
      data[i] = message.data[i] === -1 ? 128 : message.data[i] * 2.55
    }
    const texture = new THREE.DataTexture(data, width, height, THREE.LuminanceFormat)
    texture.needsUpdate = true
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(origin.x + (width * resolution) / 2, origin.z, origin.y + (height * resolution) / 2)
    scene.add(mesh)
  })

  pointCloudListener = new ROSLIB.Topic({
    ros: props.ros,
    name: '/points',
    messageType: 'sensor_msgs/PointCloud2'
  })

  pointCloudListener.subscribe((message) => {
    if (!scene) return
    try {
      const points = []
      const colors = []
      const pointStep = message.point_step
      const data = new Float32Array(message.data.buffer)

      for (let i = 0; i < message.width * message.height; i++) {
        const offset = i * pointStep / 4
        if (offset + 2 < data.length) {
          points.push(data[offset], data[offset + 1], data[offset + 2])
          colors.push(1, 1, 1)
        }
      }

      if (points.length > 0) {
        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
        const material = new THREE.PointsMaterial({ size: 0.05, vertexColors: true })
        const cloud = new THREE.Points(geometry, material)
        scene.add(cloud)
        pointClouds.value.push(cloud)
        if (pointClouds.value.length > 3) {
          const oldCloud = pointClouds.value.shift()
          scene.remove(oldCloud)
          oldCloud.geometry.dispose()
          oldCloud.material.dispose()
        }
      }
    } catch (error) {
      console.error('Error processing point cloud:', error)
    }
  })
}

const unsubscribeFromTopics = () => {
  if (pathListener) {
    pathListener.unsubscribe()
    pathListener = null
  }
  if (mapListener) {
    mapListener.unsubscribe()
    mapListener = null
  }
  if (pointCloudListener) {
    pointCloudListener.unsubscribe()
    pointCloudListener = null
  }
  if (tfClient) {
    tfClient = null
  }
}

watch(() => props.connected, (connected) => {
  if (connected) {
    subscribeToTopics()
  } else {
    unsubscribeFromTopics()
  }
})

onMounted(() => {
  initThree()
  if (props.connected) {
    subscribeToTopics()
  }
})

onBeforeUnmount(() => {
  unsubscribeFromTopics()
  if (animationId) {
    cancelAnimationFrame(animationId)
  }
  if (resizeObserver && containerRef.value) {
    resizeObserver.unobserve(containerRef.value)
    resizeObserver.disconnect()
  }
  if (renderer) {
    if (containerRef.value && renderer.domElement) {
      containerRef.value.removeChild(renderer.domElement)
    }
    renderer.dispose()
  }
})
</script>

<template>
  <div ref="containerRef" class="view3d-container"></div>
</template>

<style scoped>
.view3d-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: #1a1a1a;
}

.view3d-container canvas {
  display: block;
}
</style>

