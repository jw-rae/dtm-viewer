import { TerrainLayer } from '../types/index.js'
import type { SlopeUnit } from '../types/index.js'
import type { HillshadeParams } from '../renderer/HillshadeService.js'
import { DEFAULT_HILLSHADE_PARAMS } from '../renderer/HillshadeService.js'
import { DEFAULT_DATASET_ID } from '../data/datasets.js'
import { DEFAULT_BASEMAP_ID } from '../data/basemaps.js'

export interface AppState {
    currentDataset: string
    activeTerrainLayer: TerrainLayer
    activeBasemap: string
    theme: string
    colorScheme: 'light' | 'dark'
    elevationRange: { min: number; max: number } | null
    slopeUnit: SlopeUnit
    hillshadeParams: HillshadeParams
}

type Listener = (state: Readonly<AppState>) => void

class AppStateManager {
    private _state: AppState
    private _listeners = new Set<Listener>()

    constructor() {
        this._state = {
            currentDataset: DEFAULT_DATASET_ID,
            activeTerrainLayer: TerrainLayer.HeightMap,
            activeBasemap: localStorage.getItem('dtm-basemap') ?? DEFAULT_BASEMAP_ID,
            theme: localStorage.getItem('dtm-theme') ?? 'blue',
            colorScheme: (localStorage.getItem('dtm-color-scheme') ?? 'light') as 'light' | 'dark',
            elevationRange: null,
            slopeUnit: 'degree',
            hillshadeParams: { ...DEFAULT_HILLSHADE_PARAMS },
        }
    }

    get state(): Readonly<AppState> {
        return this._state
    }

    update(partial: Partial<AppState>): void {
        this._state = { ...this._state, ...partial }

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

        if ('colorScheme' in partial) {
            document.documentElement.setAttribute('data-color-scheme', this._state.colorScheme)
            localStorage.setItem('dtm-color-scheme', this._state.colorScheme)
        }

        this._listeners.forEach((l) => l(this._state))
    }

    subscribe(listener: Listener): () => void {
        this._listeners.add(listener)
        return () => this._listeners.delete(listener)
    }
}

export const appState = new AppStateManager()
