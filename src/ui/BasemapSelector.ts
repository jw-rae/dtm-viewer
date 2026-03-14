import { appState } from '../state/AppState.js'
import { BASEMAPS } from '../data/basemaps.js'
import type { BasemapConfig } from '../data/basemaps.js'

const QUADRANT_BASEMAP_IDS = ['osm', 'satellite', 'topo', 'carto-dark'] as const

const QUADRANT_BASEMAPS: BasemapConfig[] = QUADRANT_BASEMAP_IDS
    .map((id) => BASEMAPS.find((basemap) => basemap.id === id))
    .filter((basemap): basemap is BasemapConfig => !!basemap)

export function createBasemapSelector(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'basemap-quadrant'

    const grid = document.createElement('div')
    grid.className = 'basemap-quadrant__grid'

    const buttons = new Map<string, HTMLButtonElement>()

    for (const basemap of QUADRANT_BASEMAPS) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'basemap-quadrant__tile'
        button.setAttribute('aria-label', `Use ${basemap.label} basemap`)
        button.setAttribute('aria-pressed', 'false')

        const thumb = document.createElement('span')
        thumb.className = 'basemap-quadrant__thumb'
        thumb.style.backgroundImage = `url("${basemap.thumbnailUrl}")`

        button.append(thumb)
        button.addEventListener('click', () => {
            appState.update({ activeBasemap: basemap.id })
        })

        buttons.set(basemap.id, button)
        grid.append(button)
    }

    const syncActiveState = (activeBasemap: string): void => {
        buttons.forEach((button, id) => {
            const isActive = id === activeBasemap
            button.classList.toggle('is-active', isActive)
            button.setAttribute('aria-pressed', String(isActive))
        })
    }

    syncActiveState(appState.state.activeBasemap)
    appState.subscribe((state) => {
        syncActiveState(state.activeBasemap)
    })

    wrapper.append(grid)
    return wrapper
}
