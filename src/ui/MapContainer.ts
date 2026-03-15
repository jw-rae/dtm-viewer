import { icon } from './icons.js'
import { createLeftControlPanel, createLocationSelector } from './LeftControlPanel.js'
import { createBasemapSelector } from './BasemapSelector.js'
import { appState } from '../state/AppState.js'

export function createMapContainer(): HTMLElement {
    const main = document.createElement('main')
    main.className = 'map-container'

    const leftPanel = createLeftControlPanel()
    const locationSelector = createLocationSelector()
    const basemapSelector = createBasemapSelector()

    const mapStage = document.createElement('section')
    mapStage.className = 'map-stage'

    // OpenLayers attaches its canvas to this element.
    const mapCanvas = document.createElement('div')
    mapCanvas.id = 'map'
    mapCanvas.className = 'map-canvas'

    // Three.js renders into this element in 3D mode.
    const map3d = document.createElement('div')
    map3d.id = 'map-3d'
    map3d.className = 'map-3d'

    // Placeholder shown until terrain data loads.
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

    // Loading overlay.
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

    // 2D / 3D view toggle button
    const viewToggle = document.createElement('button')
    viewToggle.type = 'button'
    viewToggle.className = 'view-toggle-btn'

    const syncToggle = (mode: '2d' | '3d') => {
        viewToggle.innerHTML = ''
        if (mode === '2d') {
            viewToggle.append(icon('box_3d', 16))
            const label = document.createElement('span')
            label.textContent = '3D'
            viewToggle.append(label)
            viewToggle.setAttribute('aria-label', 'Switch to 3D view')
            viewToggle.setAttribute('aria-pressed', 'false')
            mapCanvas.style.display = ''
            map3d.style.display = 'none'
            basemapSelector.style.display = ''
        } else {
            viewToggle.append(icon('layers', 16))
            const label = document.createElement('span')
            label.textContent = '2D'
            viewToggle.append(label)
            viewToggle.setAttribute('aria-label', 'Switch to 2D view')
            viewToggle.setAttribute('aria-pressed', 'true')
            mapCanvas.style.display = 'none'
            map3d.style.display = 'block'
            basemapSelector.style.display = 'none'
        }
    }

    syncToggle(appState.state.viewMode)
    appState.subscribe((state) => syncToggle(state.viewMode))

    viewToggle.addEventListener('click', () => {
        appState.update({ viewMode: appState.state.viewMode === '2d' ? '3d' : '2d' })
    })

    const topBar = document.createElement('div')
    topBar.className = 'map-top-bar'
    topBar.append(viewToggle, locationSelector)

    mapStage.append(mapCanvas, map3d, topBar, basemapSelector)
    main.append(leftPanel, mapStage)
    return main
}
