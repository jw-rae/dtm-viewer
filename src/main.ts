import '@jwrae/design-tokens'
import 'ol/ol.css'
import './style.css'

import { createMapContainer } from './ui/MapContainer.js'
import { initMap, getMap, flyTo } from './renderer/MapEngine.js'
import { loadTerrain } from './renderer/TerrainLoader.js'
import { createBBoxLayer } from './renderer/TerrainRenderer.js'
import { renderGreyscaleHeightMap, createHeightMapLayer } from './renderer/HeightMapService.js'
import { computeSlope, renderSlopeMap, createSlopeLayer } from './renderer/SlopeService.js'
import { computeAspect, renderAspectMap, createAspectLayer } from './renderer/AspectService.js'
import { computeHillshade, renderHillshadeMap, createHillshadeLayer } from './renderer/HillshadeService.js'
import { computeCurvature, renderCurvatureMap, createCurvatureLayer } from './renderer/CurvatureService.js'
import { appState } from './state/AppState.js'
import { DATASETS } from './data/datasets.js'
import { TerrainLayer } from './types/index.js'
import type { ElevationGrid, TerrainLayerState } from './types/index.js'

import type ImageLayer from 'ol/layer/Image.js'
import type ImageStatic from 'ol/source/ImageStatic.js'
import type VectorLayer from 'ol/layer/Vector.js'
import type VectorSource from 'ol/source/Vector.js'

// ── Theme bootstrap ────────────────────────────────────────────────────────────
// Applied before first paint to prevent a flash of unstyled content.
const savedTheme = localStorage.getItem('dtm-theme') ?? 'blue'
const savedScheme = localStorage.getItem('dtm-color-scheme') ?? 'light'
document.documentElement.setAttribute('data-theme', savedTheme)
document.documentElement.setAttribute('data-color-scheme', savedScheme)

// ── Mount UI ───────────────────────────────────────────────────────────────────
const app = document.getElementById('app')!
app.append(createMapContainer())

// ── Initialise OpenLayers map ──────────────────────────────────────────────────
// Must run after the DOM is appended so the #map element exists.
initMap('map')
const map = getMap()

// ── Terrain loading ────────────────────────────────────────────────────────────
const TERRAIN_LAYER_Z_BASE = 20

const terrainLayers = new Map<TerrainLayer, ImageLayer<ImageStatic>>()
let bboxLayer: VectorLayer<VectorSource> | null = null

// Cached after a dataset is loaded — reused when switching analysis layers.
let cachedGrid: ElevationGrid | null = null
let cachedBounds: [number, number, number, number] | null = null
let zoomRerenderTimer: number | null = null

function setLoadingVisible(visible: boolean): void {
  const el = document.getElementById('map-loading')
  if (el) el.style.display = visible ? 'flex' : 'none'
}

function removeTerrainLayers(): void {
  if (!map) return

  terrainLayers.forEach((layer) => {
    map.removeLayer(layer)
  })
  terrainLayers.clear()
}

function buildTerrainLayer(
  layerType: TerrainLayer,
  grid: ElevationGrid,
  bounds4326: [number, number, number, number],
): ImageLayer<ImageStatic> {
  if (layerType === TerrainLayer.HeightMap) {
    const canvas = renderGreyscaleHeightMap(grid)
    return createHeightMapLayer(canvas, bounds4326)
  }

  if (layerType === TerrainLayer.Slope) {
    const slopeGrid = computeSlope(grid, bounds4326, appState.state.slopeUnit)
    const canvas = renderSlopeMap(slopeGrid)
    return createSlopeLayer(canvas, bounds4326)
  }

  if (layerType === TerrainLayer.Aspect) {
    const aspectData = computeAspect(grid)
    const canvas = renderAspectMap(aspectData, grid.width, grid.height)
    return createAspectLayer(canvas, bounds4326)
  }

  if (layerType === TerrainLayer.Hillshade) {
    const hsData = computeHillshade(grid, bounds4326, appState.state.hillshadeParams)
    const canvas = renderHillshadeMap(hsData, grid.width, grid.height)
    return createHillshadeLayer(canvas, bounds4326)
  }

  const result = computeCurvature(grid, appState.state.curvatureType)
  const canvas = renderCurvatureMap(result, {
    strongFeatureThreshold: appState.state.curvatureStrengthThreshold,
    featureMode: appState.state.curvatureFeatureMode,
    minConnectedPixels: appState.state.curvatureMinLineLength,
  })
  return createCurvatureLayer(canvas, bounds4326)
}

function renderVisibleTerrainLayers(): void {
  if (!cachedGrid || !cachedBounds || !map) return

  const grid = cachedGrid
  const bounds = cachedBounds
  const enabledLayers = appState.state.terrainLayerStates.filter((entry) => entry.enabled)

  removeTerrainLayers()

  enabledLayers.forEach((entry, index) => {
    const layer = buildTerrainLayer(entry.layer, grid, bounds)
    layer.setOpacity(entry.opacity)
    layer.setZIndex(TERRAIN_LAYER_Z_BASE + (enabledLayers.length - index))
    map.addLayer(layer)
    terrainLayers.set(entry.layer, layer)
  })
}

function scheduleZoomRecompute(): void {
  if (!cachedGrid || !cachedBounds) return

  if (zoomRerenderTimer !== null) window.clearTimeout(zoomRerenderTimer)
  zoomRerenderTimer = window.setTimeout(() => {
    zoomRerenderTimer = null
    renderVisibleTerrainLayers()
  }, 150)
}

function isTerrainLayerEnabled(
  layers: TerrainLayerState[],
  layerType: TerrainLayer,
): boolean {
  return layers.some((entry) => entry.layer === layerType && entry.enabled)
}

async function loadAndRenderDataset(datasetId: string): Promise<void> {
  const dataset = DATASETS.find((d) => d.id === datasetId)
  if (!dataset || !dataset.url) return

  if (!map) return

  // Remove previous terrain + bbox layers
  if (zoomRerenderTimer !== null) {
    window.clearTimeout(zoomRerenderTimer)
    zoomRerenderTimer = null
  }

  removeTerrainLayers()
  if (bboxLayer) { map.removeLayer(bboxLayer); bboxLayer = null }
  cachedGrid = null
  cachedBounds = null
  appState.update({ elevationRange: null })

  setLoadingVisible(true)
  try {
    const { grid, bounds4326 } = await loadTerrain(dataset.url)
    cachedGrid = grid
    cachedBounds = bounds4326
    appState.update({ elevationRange: { min: grid.minElevation, max: grid.maxElevation } })

    renderVisibleTerrainLayers()

    const bbox = createBBoxLayer(bounds4326)
    map.addLayer(bbox)
    bboxLayer = bbox as unknown as VectorLayer<VectorSource>

    flyTo(dataset.initialCenter as [number, number], dataset.initialZoom)
  } catch (err) {
    console.error('[DTM] Failed to load terrain:', err)
  } finally {
    setLoadingVisible(false)
  }
}

if (map) {
  map.getView().on('change:resolution', () => {
    scheduleZoomRecompute()
  })
}

// Load first dataset with a real URL, then react to dataset + layer changes.
const initialDataset = DATASETS.find((d) => !!d.url)
if (initialDataset) {
  appState.update({ currentDataset: initialDataset.id })
  loadAndRenderDataset(initialDataset.id)
}

let prevDataset = appState.state.currentDataset
let prevLayerStates = appState.state.terrainLayerStates
let prevSlopeUnit = appState.state.slopeUnit
let prevHillshadeParams = appState.state.hillshadeParams
let prevCurvatureType = appState.state.curvatureType
let prevCurvatureStrengthThreshold = appState.state.curvatureStrengthThreshold
let prevCurvatureFeatureMode = appState.state.curvatureFeatureMode
let prevCurvatureMinLineLength = appState.state.curvatureMinLineLength

appState.subscribe((state) => {
  const datasetChanged = state.currentDataset !== prevDataset
  const layerStackChanged = state.terrainLayerStates !== prevLayerStates
  const slopeChanged = state.slopeUnit !== prevSlopeUnit
  const hillshadeChanged = state.hillshadeParams !== prevHillshadeParams
  const curvatureChanged = state.curvatureType !== prevCurvatureType
  const curvatureThresholdChanged = state.curvatureStrengthThreshold !== prevCurvatureStrengthThreshold
  const curvatureFeatureModeChanged = state.curvatureFeatureMode !== prevCurvatureFeatureMode
  const curvatureMinLineLengthChanged = state.curvatureMinLineLength !== prevCurvatureMinLineLength

  prevDataset = state.currentDataset
  prevLayerStates = state.terrainLayerStates
  prevSlopeUnit = state.slopeUnit
  prevHillshadeParams = state.hillshadeParams
  prevCurvatureType = state.curvatureType
  prevCurvatureStrengthThreshold = state.curvatureStrengthThreshold
  prevCurvatureFeatureMode = state.curvatureFeatureMode
  prevCurvatureMinLineLength = state.curvatureMinLineLength

  if (datasetChanged) {
    loadAndRenderDataset(state.currentDataset)
    return
  }

  if (layerStackChanged) {
    renderVisibleTerrainLayers()
    return
  }

  if (
    (slopeChanged && isTerrainLayerEnabled(state.terrainLayerStates, TerrainLayer.Slope)) ||
    (hillshadeChanged && isTerrainLayerEnabled(state.terrainLayerStates, TerrainLayer.Hillshade)) ||
    (
      (
        curvatureChanged ||
        curvatureThresholdChanged ||
        curvatureFeatureModeChanged ||
        curvatureMinLineLengthChanged
      ) &&
      isTerrainLayerEnabled(state.terrainLayerStates, TerrainLayer.Curvature)
    )
  ) {
    renderVisibleTerrainLayers()
  }
})
