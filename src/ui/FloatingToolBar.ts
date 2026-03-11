import { appState } from '../state/AppState.js'
import { TerrainLayer } from '../types/index.js'
import { icon } from './icons.js'
import type { IconName } from './icons.js'

interface ToolConfig {
    layer: TerrainLayer
    label: string
    iconName: IconName
    description: string
    implemented: boolean
}

const TOOLS: ToolConfig[] = [
    {
        layer: TerrainLayer.HeightMap,
        label: 'Height Map',
        iconName: 'mountain',
        description: 'Elevation gradient from minimum to maximum height. Darker tones represent lower elevations; lighter tones represent higher elevations.',
        implemented: true,
    },
    {
        layer: TerrainLayer.Hillshade,
        label: 'Hillshade',
        iconName: 'sun',
        description: 'Simulated illumination from a directional light source that reveals surface texture and topographic form.',
        implemented: false,
    },
    {
        layer: TerrainLayer.Contour,
        label: 'Contour Lines',
        iconName: 'layers',
        description: 'Isolines connecting points of equal elevation. The spacing between lines indicates terrain steepness.',
        implemented: false,
    },
    {
        layer: TerrainLayer.Slope,
        label: 'Slope',
        iconName: 'trending_up',
        description: 'Rate of elevation change per unit distance. Steeper gradients highlight terrain severity and runoff risk.',
        implemented: false,
    },
    {
        layer: TerrainLayer.Aspect,
        label: 'Aspect',
        iconName: 'compass',
        description: 'Cardinal direction each surface cell faces relative to north. Useful for solar exposure and hydrological analysis.',
        implemented: false,
    },
    {
        layer: TerrainLayer.Curvature,
        label: 'Curvature',
        iconName: 'activity',
        description: 'Second derivative of elevation, showing surface convexity and concavity. Highlights ridges, valleys, and saddle points.',
        implemented: false,
    },
]

function formatElevation(m: number): string {
    return `${Math.round(m).toLocaleString()} m`
}

function buildPopupContent(layer: TerrainLayer, popup: HTMLElement): void {
    popup.innerHTML = ''

    const tool = TOOLS.find((t) => t.layer === layer)!

    // ── Header ──────────────────────────────────────────────────────────────
    const header = document.createElement('div')
    header.className = 'tool-popup__header'

    const headerIcon = icon(tool.iconName, 16)
    headerIcon.classList.add('tool-popup__icon')

    const titleEl = document.createElement('span')
    titleEl.className = 'tool-popup__title'
    titleEl.textContent = tool.label

    header.append(headerIcon, titleEl)
    popup.append(header)

    // ── Description ─────────────────────────────────────────────────────────
    const divider1 = document.createElement('div')
    divider1.className = 'tool-popup__divider'
    popup.append(divider1)

    const desc = document.createElement('p')
    desc.className = 'tool-popup__description'
    desc.textContent = tool.description
    popup.append(desc)

    // ── Layer-specific content ───────────────────────────────────────────────
    if (!tool.implemented) {
        const badge = document.createElement('span')
        badge.className = 'tool-popup__coming-soon'
        badge.textContent = 'Coming soon'
        popup.append(badge)
        return
    }

    // Height map — elevation legend
    if (layer === TerrainLayer.HeightMap) {
        const divider2 = document.createElement('div')
        divider2.className = 'tool-popup__divider'
        popup.append(divider2)

        const section = document.createElement('div')
        section.className = 'tool-popup__section'

        const sectionTitle = document.createElement('div')
        sectionTitle.className = 'tool-popup__section-title'
        sectionTitle.textContent = 'Elevation Legend'

        const gradient = document.createElement('div')
        gradient.className = 'tool-popup__gradient'
        // Greyscale matches the renderer: black = min, white = max
        gradient.style.background = 'linear-gradient(to right, #000000, #ffffff)'

        const labels = document.createElement('div')
        labels.className = 'tool-popup__gradient-labels'

        const { elevationRange } = appState.state
        const minLabel = document.createElement('span')
        minLabel.textContent = elevationRange ? formatElevation(elevationRange.min) : '—'
        const maxLabel = document.createElement('span')
        maxLabel.textContent = elevationRange ? formatElevation(elevationRange.max) : '—'

        labels.append(minLabel, maxLabel)
        section.append(sectionTitle, gradient, labels)
        popup.append(section)
    }
}

export function createFloatingToolBar(): HTMLElement {
    // Wrapper — positions both toolbar and popup absolutely in the map container
    const wrapper = document.createElement('div')
    wrapper.className = 'tool-panel-wrapper'

    const toolbar = document.createElement('div')
    toolbar.className = 'floating-toolbar'
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-label', 'Terrain analysis tools')

    const popup = document.createElement('div')
    popup.className = 'tool-popup tool-popup--hidden'
    popup.setAttribute('role', 'region')
    popup.setAttribute('aria-label', 'Layer information')

    let popupOpen = false

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
            const alreadyActive = appState.state.activeTerrainLayer === tool.layer

            if (alreadyActive && popupOpen) {
                // Toggle closed
                popup.classList.add('tool-popup--hidden')
                popupOpen = false
            } else {
                // Switch layer (if different) and show popup
                if (!alreadyActive) {
                    appState.update({ activeTerrainLayer: tool.layer })
                }
                buildPopupContent(tool.layer, popup)
                popup.classList.remove('tool-popup--hidden')
                popupOpen = true
            }
        })

        buttons.push(btn)
        toolbar.append(btn)
    }

    appState.subscribe((state) => {
        buttons.forEach((btn, i) => {
            btn.classList.toggle('is-active', TOOLS[i].layer === state.activeTerrainLayer)
        })
        // Rebuild popup if open (handles elevation range updates after dataset loads)
        if (popupOpen) {
            buildPopupContent(state.activeTerrainLayer, popup)
        }
    })

    // Close popup when clicking outside the wrapper
    document.addEventListener('click', (e) => {
        if (popupOpen && !wrapper.contains(e.target as Node)) {
            popup.classList.add('tool-popup--hidden')
            popupOpen = false
        }
    })

    wrapper.append(toolbar, popup)
    return wrapper
}

