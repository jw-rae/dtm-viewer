import { icon } from './icons.js'
import { createFloatingToolBar } from './FloatingToolBar.js'
import { createBasemapSelector } from './BasemapSelector.js'

export function createMapContainer(): HTMLElement {
    const main = document.createElement('main')
    main.className = 'map-container'

    // OpenLayers attaches its canvas to this element in Step 3.
    const mapCanvas = document.createElement('div')
    mapCanvas.id = 'map'
    mapCanvas.className = 'map-canvas'

    // Placeholder shown until terrain data loads (removed in Step 4).
    const placeholder = document.createElement('div')
    placeholder.className = 'map-placeholder'
    placeholder.id = 'map-placeholder'

    const inner = document.createElement('div')
    inner.className = 'map-placeholder__inner'

    const placeholderIcon = icon('mountain', 52)
    placeholderIcon.classList.add('map-placeholder__icon')

    const text = document.createElement('p')
    text.className = 'map-placeholder__text'
    text.textContent = 'Select a dataset to begin'

    inner.append(placeholderIcon, text)
    placeholder.append(inner)
    mapCanvas.append(placeholder)

    // Loading overlay — shown while GeoTIFF is being fetched and processed.
    const loading = document.createElement('div')
    loading.id = 'map-loading'
    const spinner = document.createElement('div')
    spinner.className = 'map-loading__spinner'
    const loadingLabel = document.createElement('p')
    loadingLabel.className = 'map-loading__label'
    loadingLabel.textContent = 'Loading terrain…'
    const loadingInner = document.createElement('div')
    loadingInner.style.display = 'flex'
    loadingInner.style.flexDirection = 'column'
    loadingInner.style.alignItems = 'center'
    loadingInner.append(spinner, loadingLabel)
    loading.append(loadingInner)
    mapCanvas.append(loading)

    main.append(mapCanvas, createFloatingToolBar(), createBasemapSelector())
    return main
}
