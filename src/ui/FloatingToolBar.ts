import { appState } from '../state/AppState.js'
import { TerrainLayer } from '../types/index.js'
import { icon } from './icons.js'
import type { IconName } from './icons.js'

interface ToolConfig {
    layer: TerrainLayer
    label: string
    iconName: IconName
}

const TOOLS: ToolConfig[] = [
    { layer: TerrainLayer.HeightMap, label: 'Height Map', iconName: 'mountain' },
    { layer: TerrainLayer.Hillshade, label: 'Hillshade', iconName: 'sun' },
    { layer: TerrainLayer.Contour, label: 'Contour Lines', iconName: 'layers' },
    { layer: TerrainLayer.Slope, label: 'Slope', iconName: 'trending_up' },
    { layer: TerrainLayer.Aspect, label: 'Aspect', iconName: 'compass' },
    { layer: TerrainLayer.Curvature, label: 'Curvature', iconName: 'activity' },
]

export function createFloatingToolBar(): HTMLElement {
    const toolbar = document.createElement('div')
    toolbar.className = 'floating-toolbar'
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-label', 'Terrain analysis tools')

    const buttons: HTMLButtonElement[] = []

    for (const tool of TOOLS) {
        const btn = document.createElement('button')
        btn.className = 'tool-button'
        btn.setAttribute('type', 'button')
        btn.setAttribute('aria-label', tool.label)
        btn.setAttribute('title', tool.label)
        btn.appendChild(icon(tool.iconName, 20))

        if (appState.state.activeTerrainLayer === tool.layer) {
            btn.classList.add('is-active')
        }

        btn.addEventListener('click', () => {
            appState.update({ activeTerrainLayer: tool.layer })
        })

        buttons.push(btn)
        toolbar.append(btn)
    }

    appState.subscribe((state) => {
        buttons.forEach((btn, i) => {
            btn.classList.toggle('is-active', TOOLS[i].layer === state.activeTerrainLayer)
        })
    })

    return toolbar
}
