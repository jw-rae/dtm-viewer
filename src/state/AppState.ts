import { TerrainLayer } from '../types/index.js'
import type { TerrainLayerState, SlopeUnit } from '../types/index.js'
import type { HillshadeParams } from '../renderer/HillshadeService.js'
import { DEFAULT_HILLSHADE_PARAMS } from '../renderer/HillshadeService.js'
import type { CurvatureFeatureMode, CurvatureType } from '../renderer/CurvatureService.js'
import { DEFAULT_DATASET_ID } from '../data/datasets.js'
import { DEFAULT_BASEMAP_ID, isBasemapId } from '../data/basemaps.js'

export interface AppState {
    currentDataset: string
    /** Filename of a locally imported TIF, or null when using a built-in dataset. */
    importedFileName: string | null
    activeTerrainLayer: TerrainLayer
    activeBasemap: string
    terrainLayerStates: TerrainLayerState[]
    theme: string
    colorScheme: 'light' | 'dark'
    elevationRange: { min: number; max: number } | null
    slopeUnit: SlopeUnit
    hillshadeParams: HillshadeParams
    curvatureType: CurvatureType
    curvatureStrengthThreshold: number
    curvatureFeatureMode: CurvatureFeatureMode
    curvatureMinLineLength: number
}

type Listener = (state: Readonly<AppState>) => void

const DEFAULT_TERRAIN_LAYER_STATES: TerrainLayerState[] = [
    { layer: TerrainLayer.HeightMap, enabled: true, opacity: 0.85, expanded: true },
    { layer: TerrainLayer.Hillshade, enabled: false, opacity: 0.8, expanded: false },
    { layer: TerrainLayer.Slope, enabled: false, opacity: 0.85, expanded: false },
    { layer: TerrainLayer.Aspect, enabled: false, opacity: 0.85, expanded: false },
    { layer: TerrainLayer.Curvature, enabled: false, opacity: 0.85, expanded: false },
]

const TERRAIN_LAYER_SET = new Set<TerrainLayer>(Object.values(TerrainLayer))

function readNumberSetting(key: string, fallback: number): number {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
}

function clampOpacity(value: number): number {
    if (!Number.isFinite(value)) return 0.85
    return Math.min(1, Math.max(0, Number(value.toFixed(2))))
}

function clampCurvatureThreshold(value: number): number {
    if (!Number.isFinite(value)) return 0.08
    return Math.min(0.95, Math.max(0, Number(value.toFixed(2))))
}

function clampCurvatureMinLineLength(value: number): number {
    if (!Number.isFinite(value)) return 8
    return Math.min(1000, Math.max(1, Math.round(value)))
}

function normalizeCurvatureFeatureMode(value: string | null): CurvatureFeatureMode {
    if (value === 'ridges' || value === 'valleys') return value
    return 'both'
}

function normalizeTerrainLayerStates(raw: unknown): TerrainLayerState[] {
    if (!Array.isArray(raw)) {
        return DEFAULT_TERRAIN_LAYER_STATES.map((entry) => ({ ...entry }))
    }

    const seen = new Set<TerrainLayer>()
    const normalized: TerrainLayerState[] = []

    for (const candidate of raw) {
        if (!candidate || typeof candidate !== 'object') continue

        const value = candidate as Partial<TerrainLayerState>
        if (typeof value.layer !== 'string') continue
        if (!TERRAIN_LAYER_SET.has(value.layer as TerrainLayer)) continue

        const layer = value.layer as TerrainLayer
        if (seen.has(layer)) continue
        seen.add(layer)

        const fallback = DEFAULT_TERRAIN_LAYER_STATES.find((entry) => entry.layer === layer)
        if (!fallback) continue

        normalized.push({
            layer,
            enabled: typeof value.enabled === 'boolean' ? value.enabled : fallback.enabled,
            opacity: clampOpacity(typeof value.opacity === 'number' ? value.opacity : fallback.opacity),
            expanded: typeof value.expanded === 'boolean' ? value.expanded : fallback.expanded,
        })
    }

    for (const fallback of DEFAULT_TERRAIN_LAYER_STATES) {
        if (!seen.has(fallback.layer)) normalized.push({ ...fallback })
    }

    return normalized
}

function readTerrainLayerStates(): TerrainLayerState[] {
    const raw = localStorage.getItem('dtm-terrain-layers')
    if (!raw) return DEFAULT_TERRAIN_LAYER_STATES.map((entry) => ({ ...entry }))

    try {
        return normalizeTerrainLayerStates(JSON.parse(raw))
    } catch {
        return DEFAULT_TERRAIN_LAYER_STATES.map((entry) => ({ ...entry }))
    }
}

function ensureBasemapId(id: string | null): string {
    if (id && isBasemapId(id)) return id
    return DEFAULT_BASEMAP_ID
}

function deriveActiveTerrainLayer(layerStates: TerrainLayerState[]): TerrainLayer {
    return layerStates.find((entry) => entry.enabled)?.layer ?? TerrainLayer.HeightMap
}

class AppStateManager {
    private _state: AppState
    private _listeners = new Set<Listener>()

    constructor() {
        const terrainLayerStates = readTerrainLayerStates()
        this._state = {
            currentDataset: DEFAULT_DATASET_ID,
            importedFileName: null,
            activeTerrainLayer: deriveActiveTerrainLayer(terrainLayerStates),
            activeBasemap: ensureBasemapId(localStorage.getItem('dtm-basemap')),
            terrainLayerStates,
            theme: localStorage.getItem('dtm-theme') ?? 'blue',
            colorScheme: (localStorage.getItem('dtm-color-scheme') ?? 'light') as 'light' | 'dark',
            elevationRange: null,
            slopeUnit: 'degree',
            hillshadeParams: { ...DEFAULT_HILLSHADE_PARAMS },
            curvatureType: 'standard',
            curvatureStrengthThreshold: clampCurvatureThreshold(
                readNumberSetting('dtm-curvature-strength-threshold', 0.08),
            ),
            curvatureFeatureMode: normalizeCurvatureFeatureMode(
                localStorage.getItem('dtm-curvature-feature-mode'),
            ),
            curvatureMinLineLength: clampCurvatureMinLineLength(
                readNumberSetting('dtm-curvature-min-line-length', 8),
            ),
        }
    }

    get state(): Readonly<AppState> {
        return this._state
    }

    update(partial: Partial<AppState>): void {
        let nextState: AppState = { ...this._state, ...partial }

        if ('terrainLayerStates' in partial && partial.terrainLayerStates !== undefined) {
            nextState.terrainLayerStates = normalizeTerrainLayerStates(partial.terrainLayerStates)
        }

        if (
            'activeTerrainLayer' in partial &&
            partial.activeTerrainLayer !== undefined &&
            !('terrainLayerStates' in partial)
        ) {
            nextState.terrainLayerStates = this._state.terrainLayerStates.map((entry) => {
                if (entry.layer !== partial.activeTerrainLayer) return entry
                return {
                    ...entry,
                    enabled: true,
                    expanded: true,
                }
            })
        }

        if ('activeBasemap' in partial) {
            nextState.activeBasemap = ensureBasemapId(nextState.activeBasemap)
        }

        if ('curvatureStrengthThreshold' in partial && partial.curvatureStrengthThreshold !== undefined) {
            nextState.curvatureStrengthThreshold = clampCurvatureThreshold(partial.curvatureStrengthThreshold)
        }

        if ('curvatureFeatureMode' in partial && partial.curvatureFeatureMode !== undefined) {
            nextState.curvatureFeatureMode =
                partial.curvatureFeatureMode === 'ridges' || partial.curvatureFeatureMode === 'valleys'
                    ? partial.curvatureFeatureMode
                    : 'both'
        }

        if ('curvatureMinLineLength' in partial && partial.curvatureMinLineLength !== undefined) {
            nextState.curvatureMinLineLength = clampCurvatureMinLineLength(partial.curvatureMinLineLength)
        }

        nextState.activeTerrainLayer = deriveActiveTerrainLayer(nextState.terrainLayerStates)

        this._state = nextState

        if ('theme' in partial) {
            const t = this._state.theme
            if (t === 'default') {
                document.documentElement.removeAttribute('data-theme')
                localStorage.removeItem('dtm-theme')
            } else {
                document.documentElement.setAttribute('data-theme', t)
                localStorage.setItem('dtm-theme', t)
            }
        }

        if ('activeBasemap' in partial) {
            localStorage.setItem('dtm-basemap', this._state.activeBasemap)
        }

        if ('terrainLayerStates' in partial || 'activeTerrainLayer' in partial) {
            localStorage.setItem('dtm-terrain-layers', JSON.stringify(this._state.terrainLayerStates))
        }

        if ('colorScheme' in partial) {
            document.documentElement.setAttribute('data-color-scheme', this._state.colorScheme)
            localStorage.setItem('dtm-color-scheme', this._state.colorScheme)
        }

        if ('curvatureStrengthThreshold' in partial) {
            localStorage.setItem(
                'dtm-curvature-strength-threshold',
                String(this._state.curvatureStrengthThreshold),
            )
        }

        if ('curvatureFeatureMode' in partial) {
            localStorage.setItem('dtm-curvature-feature-mode', this._state.curvatureFeatureMode)
        }

        if ('curvatureMinLineLength' in partial) {
            localStorage.setItem(
                'dtm-curvature-min-line-length',
                String(this._state.curvatureMinLineLength),
            )
        }

        this._listeners.forEach((l) => l(this._state))
    }

    subscribe(listener: Listener): () => void {
        this._listeners.add(listener)
        return () => this._listeners.delete(listener)
    }
}

export const appState = new AppStateManager()
