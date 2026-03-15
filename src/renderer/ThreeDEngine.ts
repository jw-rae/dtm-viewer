import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { ElevationGrid } from '../types/index.js'

function readBgColor(): THREE.Color {
    const raw = getComputedStyle(document.documentElement)
        .getPropertyValue('--color-background-primary').trim() || '#1a1d27'
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const ctx = c.getContext('2d')!
    ctx.fillStyle = raw
    ctx.fillRect(0, 0, 1, 1)
    const d = ctx.getImageData(0, 0, 1, 1).data
    return new THREE.Color(d[0] / 255, d[1] / 255, d[2] / 255)
}

// ── Public interface ───────────────────────────────────────────────────────────

export interface ThreeDScene {
    updateTexture(canvas: HTMLCanvasElement): void
    updateBackground(): void
    resize(): void
    dispose(): void
}

// ── Geometry ───────────────────────────────────────────────────────────────────

/**
 * Builds a terrain BufferGeometry from an ElevationGrid.
 *
 * Coordinate system (Y-up):
 *   X  = west → east  (−normW/2 … +normW/2)
 *   Y  = elevation (scene units, up)
 *   Z  = north → south  (−normH/2 … +normH/2)
 *
 * UV mapping (matches THREE.CanvasTexture flipY=true default):
 *   u = col / (width−1)          (0 = west, 1 = east)
 *   v = 1 − row / (height−1)     (1 = north/row 0, 0 = south/last row)
 */
function buildTerrainGeometry(
    grid: ElevationGrid,
    bounds4326: [number, number, number, number],
    zFactor: number,
): { geometry: THREE.BufferGeometry; normW: number; normH: number; elevScale: number } {
    const { data, width, height, noDataValue, minElevation, maxElevation } = grid
    const [west, south, east, north] = bounds4326
    const centerLat = (south + north) / 2

    // Physical footprint in metres
    const metersW = (east - west) * 111_320 * Math.cos((centerLat * Math.PI) / 180)
    const metersH = (north - south) * 111_320
    const maxMeters = Math.max(metersW, metersH)

    // Normalise horizontal to unit scene
    const normW = metersW / maxMeters
    const normH = metersH / maxMeters

    // Vertical scale: elevation metres → scene units, with exaggeration
    const elevRange = maxElevation - minElevation
    const elevScale = elevRange > 0 ? (normW / metersW) * zFactor : 0

    const vertexCount = width * height
    const positions = new Float32Array(vertexCount * 3)
    const uvs = new Float32Array(vertexCount * 2)

    for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
            const idx = row * width + col
            const x = (col / (width - 1) - 0.5) * normW
            const z = (row / (height - 1) - 0.5) * normH
            const v = data[idx]
            const elev = Math.abs(v - noDataValue) < 0.5 ? minElevation : v
            const y = (elev - minElevation) * elevScale

            positions[idx * 3 + 0] = x
            positions[idx * 3 + 1] = y
            positions[idx * 3 + 2] = z

            uvs[idx * 2 + 0] = col / (width - 1)
            uvs[idx * 2 + 1] = 1 - row / (height - 1)
        }
    }

    // Indexed triangles — two CCW triangles per quad
    const indexCount = (width - 1) * (height - 1) * 6
    const indices = new Uint32Array(indexCount)
    let ii = 0
    for (let row = 0; row < height - 1; row++) {
        for (let col = 0; col < width - 1; col++) {
            const tl = row * width + col
            const tr = tl + 1
            const bl = tl + width
            const br = bl + 1
            indices[ii++] = tl; indices[ii++] = bl; indices[ii++] = tr
            indices[ii++] = tr; indices[ii++] = bl; indices[ii++] = br
        }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    geometry.computeVertexNormals()

    return { geometry, normW, normH, elevScale }
}

// ── initThreeD ─────────────────────────────────────────────────────────────────

export function initThreeD(
    container: HTMLElement,
    grid: ElevationGrid,
    bounds4326: [number, number, number, number],
    textureCanvas: HTMLCanvasElement,
): ThreeDScene {
    const zFactor = 1
    const W = container.clientWidth || 800
    const H = container.clientHeight || 600

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    renderer.shadowMap.enabled = false
    container.append(renderer.domElement)

    // Scene + background
    const scene = new THREE.Scene()
    scene.background = readBgColor()
    scene.fog = null

    // Camera
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.001, 200)

    // Terrain geometry + texture
    const { geometry, normW, normH } = buildTerrainGeometry(grid, bounds4326, zFactor)

    geometry.computeBoundingBox()
    const box = geometry.boundingBox!
    const terrainCenter = new THREE.Vector3()
    box.getCenter(terrainCenter)
    const terrainSize = new THREE.Vector3()
    box.getSize(terrainSize)
    const maxHoriz = Math.max(terrainSize.x, terrainSize.z)

    const texture = new THREE.CanvasTexture(textureCanvas)
    texture.colorSpace = THREE.SRGBColorSpace

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 1.0,
        metalness: 0.0,
    })

    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    // Lighting — ambient fill + sun-like directional
    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(normW * 0.7, terrainSize.y + maxHoriz * 0.9, -normH * 0.5)
    scene.add(sun)

    // Camera initial position: above and angled from south
    camera.position.set(
        terrainCenter.x,
        terrainCenter.y + maxHoriz * 0.75,
        terrainCenter.z + maxHoriz * 0.9,
    )
    camera.lookAt(terrainCenter)

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.target.copy(terrainCenter)
    controls.enableDamping = true
    controls.dampingFactor = 0.07
    controls.screenSpacePanning = true

    // ── Extent constraints ─────────────────────────────────────────────────────
    controls.minDistance = maxHoriz * 0.04
    controls.maxDistance = maxHoriz * 3.5
    controls.maxPolarAngle = (Math.PI / 2) - 0.01   // never go underground

    // Clamp pan target so the terrain stays in frame
    const panHalfW = normW * 0.65
    const panHalfH = normH * 0.65
    const maxTargetY = terrainCenter.y + terrainSize.y * 0.5
    controls.addEventListener('change', () => {
        controls.target.x = Math.max(-panHalfW, Math.min(panHalfW, controls.target.x))
        controls.target.z = Math.max(-panHalfH, Math.min(panHalfH, controls.target.z))
        controls.target.y = Math.max(0, Math.min(maxTargetY, controls.target.y))
    })

    controls.update()

    // Animation loop
    let rafId = 0
    const animate = () => {
        rafId = requestAnimationFrame(animate)
        controls.update()
        renderer.render(scene, camera)
    }
    animate()

    // ── Public API ─────────────────────────────────────────────────────────────

    return {
        updateTexture(canvas: HTMLCanvasElement) {
            const prev = material.map
            const next = new THREE.CanvasTexture(canvas)
            next.colorSpace = THREE.SRGBColorSpace
            material.map = next
            material.needsUpdate = true
            prev?.dispose()
        },

        updateBackground() {
            scene.background = readBgColor()
        },

        resize() {
            const w = container.clientWidth
            const h = container.clientHeight
            if (!w || !h) return
            camera.aspect = w / h
            camera.updateProjectionMatrix()
            renderer.setSize(w, h)
        },

        dispose() {
            cancelAnimationFrame(rafId)
            controls.dispose()
            geometry.dispose()
            material.map?.dispose()
            material.dispose()
            renderer.dispose()
            renderer.domElement.remove()
        },
    }
}
