import { appState } from '../state/AppState.js'
import type { AppState } from '../state/AppState.js'
import { DATASETS } from '../data/datasets.js'
import { TerrainLayer } from '../types/index.js'
import type { TerrainLayerState, SlopeUnit } from '../types/index.js'
import type { HillshadeParams } from '../renderer/HillshadeService.js'
import { sunPositionToAngles } from '../renderer/HillshadeService.js'
import { SLOPE_GRADIENT_CSS } from '../renderer/SlopeService.js'
import { ASPECT_LINEAR_CSS } from '../renderer/AspectService.js'
import type { CurvatureType } from '../renderer/CurvatureService.js'
import { CURVATURE_GRADIENT_CSS } from '../renderer/CurvatureService.js'
import { icon, themePickerIcon } from './icons.js'
import type { IconName } from './icons.js'

interface LayerOption {
    layer: TerrainLayer
    label: string
    iconName: IconName
    description: string
}

const LAYER_OPTIONS: LayerOption[] = [
    {
        layer: TerrainLayer.HeightMap,
        label: 'Height Map',
        iconName: 'mountain',
        description: 'Greyscale elevation values from low to high terrain.',
    },
    {
        layer: TerrainLayer.Hillshade,
        label: 'Hillshade',
        iconName: 'sun',
        description: 'Shaded relief from a simulated sun position.',
    },
    {
        layer: TerrainLayer.Slope,
        label: 'Slope',
        iconName: 'trending_up',
        description: 'Terrain steepness measured in degrees or percent rise.',
    },
    {
        layer: TerrainLayer.Aspect,
        label: 'Aspect',
        iconName: 'compass',
        description: 'Down-slope compass direction for each terrain cell.',
    },
    {
        layer: TerrainLayer.Curvature,
        label: 'Curvature',
        iconName: 'activity',
        description: 'Surface convexity and concavity from second derivatives.',
    },
]

const THEMES = [
    { value: 'warm', label: 'Warm', color: '#777674' },
    { value: 'cool', label: 'Cool', color: '#71747e' },
    { value: 'pink', label: 'Pink', color: '#937886' },
    { value: 'green', label: 'Green', color: '#7c7e7c' },
    { value: 'blue', label: 'Blue', color: '#757b87' },
] as const

function toTransparency(opacity: number): number {
    return Math.round((1 - opacity) * 100)
}

function toOpacity(transparency: number): number {
    const clamped = Math.max(0, Math.min(100, transparency))
    return Number((1 - clamped / 100).toFixed(2))
}

function updateLayerState(layer: TerrainLayer, patch: Partial<TerrainLayerState>): void {
    const next = appState.state.terrainLayerStates.map((entry) => {
        if (entry.layer !== layer) return entry
        return {
            ...entry,
            ...patch,
        }
    })

    appState.update({ terrainLayerStates: next })
}

function moveLayer(movedLayer: TerrainLayer, targetLayer: TerrainLayer): void {
    if (movedLayer === targetLayer) return

    const next = [...appState.state.terrainLayerStates]
    const fromIndex = next.findIndex((entry) => entry.layer === movedLayer)
    const toIndex = next.findIndex((entry) => entry.layer === targetLayer)
    if (fromIndex < 0 || toIndex < 0) return

    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    appState.update({ terrainLayerStates: next })
}

function createLabel(text: string): HTMLLabelElement {
    const label = document.createElement('label')
    label.className = 'left-panel__label'
    label.textContent = text
    return label
}

function createInlineValue(text: string): HTMLElement {
    const value = document.createElement('span')
    value.className = 'left-panel__inline-value'
    value.textContent = text
    return value
}

function createInlineHeader(label: string, valueText: string): { row: HTMLElement; value: HTMLElement } {
    const row = document.createElement('div')
    row.className = 'left-panel__inline-header'

    const labelEl = createLabel(label)
    const value = createInlineValue(valueText)

    row.append(labelEl, value)
    return { row, value }
}

function createDatasetSelect(className: string): HTMLSelectElement {
    const select = document.createElement('select')
    select.className = className
    for (const dataset of DATASETS) {
        const option = document.createElement('option')
        option.value = dataset.id
        option.textContent = dataset.label
        select.append(option)
    }

    // Sentinel option that triggers the file picker
    const importOpt = document.createElement('option')
    importOpt.value = '__import__'
    importOpt.textContent = 'Import TIF…'
    select.append(importOpt)

    select.value = appState.state.currentDataset

    // Hidden file input
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.tif,.tiff'
    fileInput.style.display = 'none'
    fileInput.setAttribute('aria-hidden', 'true')
    document.body.append(fileInput)

    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0]
        if (!file) {
            select.value = appState.state.currentDataset
            return
        }
        window.dispatchEvent(new CustomEvent('dtm:import-file', { detail: { file } }))
        appState.update({ currentDataset: '__imported__', importedFileName: file.name })
        fileInput.value = ''
    })

    select.addEventListener('change', () => {
        if (select.value === '__import__') {
            select.value = appState.state.currentDataset
            fileInput.click()
            return
        }
        appState.update({ currentDataset: select.value })
    })

    appState.subscribe((state) => {
        // Add/update the imported-file option when a file has been loaded
        let importedOpt = select.querySelector<HTMLOptionElement>('option[value="__imported__"]')
        if (state.importedFileName) {
            if (!importedOpt) {
                importedOpt = document.createElement('option')
                importedOpt.value = '__imported__'
                select.insertBefore(importedOpt, importOpt)
            }
            importedOpt.textContent = state.importedFileName
        } else if (importedOpt) {
            importedOpt.remove()
        }
        if (select.value !== state.currentDataset) select.value = state.currentDataset
    })

    return select
}

export function createLocationSelector(): HTMLElement {
    const select = createDatasetSelect('map-location-picker')
    select.id = 'map-location-select'
    select.setAttribute('aria-label', 'Dataset selector')

    return select
}

function createDarkLightToggle(): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'left-panel__icon-btn'

    const syncIcon = (scheme: 'light' | 'dark'): void => {
        button.innerHTML = ''
        button.append(icon(scheme === 'dark' ? 'sun' : 'moon', 16))
        button.setAttribute(
            'aria-label',
            scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        )
    }

    syncIcon(appState.state.colorScheme)

    button.addEventListener('click', () => {
        appState.update({
            colorScheme: appState.state.colorScheme === 'dark' ? 'light' : 'dark',
        })
    })

    appState.subscribe((state) => {
        syncIcon(state.colorScheme)
    })

    return button
}

function createThemePicker(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'left-panel__theme-picker'

    const toggleButton = document.createElement('button')
    toggleButton.type = 'button'
    toggleButton.className = 'left-panel__icon-btn'
    toggleButton.setAttribute('aria-label', 'Select color theme')
    toggleButton.setAttribute('aria-haspopup', 'true')
    toggleButton.setAttribute('aria-expanded', 'false')
    toggleButton.append(themePickerIcon(16))

    const menu = document.createElement('div')
    menu.className = 'left-panel__theme-menu left-panel__theme-menu--hidden'
    menu.setAttribute('role', 'menu')

    const buildMenu = (currentTheme: string): void => {
        menu.innerHTML = ''

        for (const theme of THEMES) {
            const item = document.createElement('button')
            item.type = 'button'
            item.className = 'left-panel__theme-menu-item' + (theme.value === currentTheme ? ' is-active' : '')
            item.setAttribute('role', 'menuitem')

            const swatch = document.createElement('span')
            swatch.className = 'left-panel__theme-swatch'
            swatch.style.backgroundColor = theme.color

            const name = document.createElement('span')
            name.className = 'left-panel__theme-name'
            name.textContent = theme.label

            item.append(swatch, name)
            item.addEventListener('click', () => {
                appState.update({ theme: theme.value })
                menu.classList.add('left-panel__theme-menu--hidden')
                toggleButton.setAttribute('aria-expanded', 'false')
            })

            menu.append(item)
        }
    }

    buildMenu(appState.state.theme)

    toggleButton.addEventListener('click', (event) => {
        event.stopPropagation()
        const opening = menu.classList.contains('left-panel__theme-menu--hidden')
        if (opening) buildMenu(appState.state.theme)

        menu.classList.toggle('left-panel__theme-menu--hidden')
        toggleButton.setAttribute(
            'aria-expanded',
            String(!menu.classList.contains('left-panel__theme-menu--hidden')),
        )
    })

    document.addEventListener('click', (event) => {
        if (!wrapper.contains(event.target as Node)) {
            menu.classList.add('left-panel__theme-menu--hidden')
            toggleButton.setAttribute('aria-expanded', 'false')
        }
    })

    appState.subscribe((state) => {
        if (!menu.classList.contains('left-panel__theme-menu--hidden')) {
            buildMenu(state.theme)
        }
    })

    wrapper.append(toggleButton, menu)
    return wrapper
}

function createThemeControls(): HTMLElement {
    const actions = document.createElement('div')
    actions.className = 'left-panel__title-actions'
    actions.append(createDarkLightToggle(), createThemePicker())
    return actions
}

function hillshadePartial(partial: Partial<HillshadeParams>): void {
    appState.update({
        hillshadeParams: {
            ...appState.state.hillshadeParams,
            ...partial,
        },
    })
}

function renderSlopeParameters(host: HTMLElement, state: Readonly<AppState>): void {
    const unitLabel = createLabel('Slope Unit')
    const segmented = document.createElement('div')
    segmented.className = 'left-panel__segmented'

    const options: Array<{ unit: SlopeUnit; label: string }> = [
        { unit: 'degree', label: 'Degrees' },
        { unit: 'percent', label: 'Percent' },
    ]

    for (const option of options) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'left-panel__seg-btn'
        btn.textContent = option.label
        if (state.slopeUnit === option.unit) btn.classList.add('is-active')
        btn.addEventListener('click', () => {
            appState.update({ slopeUnit: option.unit })
            segmented.querySelectorAll('button').forEach((el) => el.classList.remove('is-active'))
            btn.classList.add('is-active')
        })
        segmented.append(btn)
    }

    host.append(unitLabel, segmented)
}

function renderHillshadeParameters(host: HTMLElement, state: Readonly<AppState>): void {
    const { row: sunHeader, value: sunValue } = createInlineHeader('Sun Position', '')
    const sunSlider = document.createElement('input')
    sunSlider.className = 'left-panel__range'
    sunSlider.type = 'range'
    sunSlider.min = '0'
    sunSlider.max = '100'
    sunSlider.step = '1'
    sunSlider.value = String(state.hillshadeParams.sunPosition)

    const sunComputed = document.createElement('p')
    sunComputed.className = 'left-panel__help'

    const updateSunInfo = (position: number): void => {
        const { azimuth, altitude } = sunPositionToAngles(position)
        sunValue.textContent = `${position}%`
        sunComputed.textContent = `Azimuth ${Math.round(azimuth)}° | Altitude ${Math.round(Math.max(0, altitude))}°`
    }

    updateSunInfo(state.hillshadeParams.sunPosition)
    sunSlider.addEventListener('input', () => {
        const position = Number(sunSlider.value)
        updateSunInfo(position)
    })
    sunSlider.addEventListener('change', () => {
        const position = Number(sunSlider.value)
        hillshadePartial({ sunPosition: position })
    })

    host.append(
        sunHeader,
        sunSlider,
        sunComputed,
    )
}

function renderCurvatureParameters(host: HTMLElement, state: Readonly<AppState>): void {
    const typeLabel = createLabel('Curvature Type')
    const select = document.createElement('select')
    select.className = 'left-panel__select'

    const options: Array<{ value: CurvatureType; label: string }> = [
        { value: 'standard', label: 'Standard' },
        { value: 'profile', label: 'Profile' },
        { value: 'plan', label: 'Plan' },
    ]

    for (const option of options) {
        const item = document.createElement('option')
        item.value = option.value
        item.textContent = option.label
        select.append(item)
    }

    select.value = state.curvatureType
    select.addEventListener('change', () => {
        appState.update({ curvatureType: select.value as CurvatureType })
    })

    const focusLabel = createLabel('Feature Focus')
    const focusSegmented = document.createElement('div')
    focusSegmented.className = 'left-panel__segmented'
    focusSegmented.style.gridTemplateColumns = 'repeat(3, 1fr)'

    const focusOptions: Array<{ value: 'both' | 'ridges' | 'valleys'; label: string }> = [
        { value: 'both', label: 'Both' },
        { value: 'ridges', label: 'Ridges' },
        { value: 'valleys', label: 'Valleys' },
    ]

    for (const option of focusOptions) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'left-panel__seg-btn'
        button.textContent = option.label
        if (state.curvatureFeatureMode === option.value) button.classList.add('is-active')

        button.addEventListener('click', () => {
            appState.update({ curvatureFeatureMode: option.value })
            focusSegmented.querySelectorAll('button').forEach((el) => el.classList.remove('is-active'))
            button.classList.add('is-active')
        })

        focusSegmented.append(button)
    }

    const { row: minLengthHeader, value: minLengthValue } = createInlineHeader(
        'Min Line Length',
        `${state.curvatureMinLineLength}px`,
    )

    const minLengthSlider = document.createElement('input')
    minLengthSlider.className = 'left-panel__range'
    minLengthSlider.type = 'range'
    minLengthSlider.min = '1'
    minLengthSlider.max = '120'
    minLengthSlider.step = '1'
    minLengthSlider.value = String(state.curvatureMinLineLength)

    minLengthSlider.addEventListener('input', () => {
        minLengthValue.textContent = `${minLengthSlider.value}px`
    })

    minLengthSlider.addEventListener('change', () => {
        appState.update({ curvatureMinLineLength: Number(minLengthSlider.value) })
    })

    const thresholdPercent = Math.round(state.curvatureStrengthThreshold * 100)
    const { row: strengthHeader, value: strengthValue } = createInlineHeader(
        'Strong Feature Filter',
        `${thresholdPercent}%`,
    )

    const strengthSlider = document.createElement('input')
    strengthSlider.className = 'left-panel__range'
    strengthSlider.type = 'range'
    strengthSlider.min = '0'
    strengthSlider.max = '95'
    strengthSlider.step = '1'
    strengthSlider.value = String(thresholdPercent)

    strengthSlider.addEventListener('input', () => {
        strengthValue.textContent = `${strengthSlider.value}%`
    })

    strengthSlider.addEventListener('change', () => {
        const threshold = Number(strengthSlider.value) / 100
        appState.update({ curvatureStrengthThreshold: threshold })
    })

    host.append(
        typeLabel,
        select,
        focusLabel,
        focusSegmented,
        minLengthHeader,
        minLengthSlider,
        strengthHeader,
        strengthSlider,
    )
}

function renderLayerControls(host: HTMLElement, state: Readonly<AppState>, layer: TerrainLayer): void {
    if (layer === TerrainLayer.Slope) {
        renderSlopeParameters(host, state)
        return
    }

    if (layer === TerrainLayer.Hillshade) {
        renderHillshadeParameters(host, state)
        return
    }

    if (layer === TerrainLayer.Curvature) {
        renderCurvatureParameters(host, state)
        return
    }
}

function formatElevationLabel(value: number): string {
    return `${Math.round(value).toLocaleString()} m`
}

function createLegendRow(state: Readonly<AppState>, layer: TerrainLayer): HTMLElement {
    const legend = document.createElement('div')
    legend.className = 'left-panel__legend'

    const bar = document.createElement('div')
    bar.className = 'left-panel__legend-bar'

    const labels = document.createElement('div')
    labels.className = 'left-panel__legend-labels'

    let leftLabel = 'Low'
    let centerLabel: string | null = null
    let rightLabel = 'High'

    if (layer === TerrainLayer.HeightMap) {
        bar.style.background = 'linear-gradient(to right, #000000, #ffffff)'
        if (state.elevationRange) {
            leftLabel = formatElevationLabel(state.elevationRange.min)
            rightLabel = formatElevationLabel(state.elevationRange.max)
        }
    } else if (layer === TerrainLayer.Hillshade) {
        bar.style.background = 'linear-gradient(to right, #181818, #f4f4f4)'
        leftLabel = 'Shadow'
        rightLabel = 'Lit'
    } else if (layer === TerrainLayer.Slope) {
        bar.style.background = SLOPE_GRADIENT_CSS
        leftLabel = state.slopeUnit === 'degree' ? '0°' : '0%'
        rightLabel = state.slopeUnit === 'degree' ? '90°' : '∞'
    } else if (layer === TerrainLayer.Aspect) {
        bar.style.background = ASPECT_LINEAR_CSS
        leftLabel = 'N'
        centerLabel = 'S'
        rightLabel = 'N'
    } else {
        bar.style.background = CURVATURE_GRADIENT_CSS
        leftLabel = 'Concave (-)'
        centerLabel = 'Flat'
        rightLabel = 'Convex (+)'
    }

    if (centerLabel !== null) labels.classList.add('left-panel__legend-labels--3')

    const left = document.createElement('span')
    left.textContent = leftLabel
    labels.append(left)

    if (centerLabel !== null) {
        const center = document.createElement('span')
        center.textContent = centerLabel
        labels.append(center)
    }

    const right = document.createElement('span')
    right.textContent = rightLabel
    labels.append(right)

    legend.append(bar, labels)
    return legend
}

function createLayerDetails(
    layerState: TerrainLayerState,
    state: Readonly<AppState>,
    description: string,
): HTMLElement {
    const details = document.createElement('div')
    details.className = 'left-panel__layer-body'

    const desc = document.createElement('p')
    desc.className = 'left-panel__layer-description'
    desc.textContent = description

    const transparency = toTransparency(layerState.opacity)
    const { row: transparencyHeader, value: transparencyValue } = createInlineHeader(
        'Transparency',
        `${transparency}%`,
    )
    const transparencySlider = document.createElement('input')
    transparencySlider.className = 'left-panel__range'
    transparencySlider.type = 'range'
    transparencySlider.min = '0'
    transparencySlider.max = '100'
    transparencySlider.step = '1'
    transparencySlider.value = String(transparency)
    transparencySlider.addEventListener('input', () => {
        transparencyValue.textContent = `${transparencySlider.value}%`
    })
    transparencySlider.addEventListener('change', () => {
        const nextTransparency = Number(transparencySlider.value)
        updateLayerState(layerState.layer, { opacity: toOpacity(nextTransparency) })
    })

    const paramsHost = document.createElement('div')
    paramsHost.className = 'left-panel__param-host'
    renderLayerControls(paramsHost, state, layerState.layer)

    details.append(
        desc,
        createLegendRow(state, layerState.layer),
        transparencyHeader,
        transparencySlider,
    )

    if (paramsHost.childElementCount > 0) {
        details.append(paramsHost)
    }

    return details
}

interface DragState {
    draggingLayer: TerrainLayer | null
}

function createLayerRow(
    option: LayerOption,
    layerState: TerrainLayerState,
    state: Readonly<AppState>,
    listHost: HTMLElement,
    dragState: DragState,
): HTMLElement {
    const row = document.createElement('article')
    row.className = 'left-panel__layer-row'
    if (layerState.enabled) row.classList.add('is-enabled')

    row.addEventListener('dragover', (event) => {
        if (!dragState.draggingLayer || dragState.draggingLayer === layerState.layer) return
        event.preventDefault()
        row.classList.add('is-drop-target')
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    })

    row.addEventListener('dragleave', () => {
        row.classList.remove('is-drop-target')
    })

    row.addEventListener('drop', (event) => {
        if (!dragState.draggingLayer || dragState.draggingLayer === layerState.layer) return
        event.preventDefault()
        row.classList.remove('is-drop-target')
        moveLayer(dragState.draggingLayer, layerState.layer)
    })

    const header = document.createElement('div')
    header.className = 'left-panel__layer-head'

    const left = document.createElement('div')
    left.className = 'left-panel__layer-main'

    const handle = document.createElement('span')
    handle.className = 'left-panel__drag-handle'
    handle.draggable = true
    handle.append(icon('grip_vertical', 14))

    handle.addEventListener('dragstart', (event) => {
        dragState.draggingLayer = layerState.layer
        row.classList.add('is-dragging')

        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', layerState.layer)
        }
    })

    handle.addEventListener('dragend', () => {
        dragState.draggingLayer = null
        row.classList.remove('is-dragging')
        listHost.querySelectorAll('.left-panel__layer-row').forEach((el) => {
            el.classList.remove('is-drop-target')
        })
    })

    const checkLabel = document.createElement('label')
    checkLabel.className = 'left-panel__layer-check'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.checked = layerState.enabled
    checkbox.addEventListener('change', () => {
        const enabled = checkbox.checked
        updateLayerState(layerState.layer, {
            enabled,
            expanded: enabled ? true : layerState.expanded,
        })
    })

    const layerIcon = icon(option.iconName, 14)
    layerIcon.classList.add('left-panel__layer-icon')

    const name = document.createElement('span')
    name.className = 'left-panel__layer-name'
    name.textContent = option.label

    checkLabel.append(checkbox, layerIcon, name)
    left.append(handle, checkLabel)

    const expandButton = document.createElement('button')
    expandButton.type = 'button'
    expandButton.className = 'left-panel__layer-expand'
    expandButton.disabled = !layerState.enabled
    expandButton.setAttribute('aria-label', `Toggle ${option.label} settings`)

    const expandIcon = icon('chevron_down', 14)
    expandIcon.classList.add('left-panel__layer-expand-icon')
    expandButton.append(expandIcon)

    if (layerState.enabled && layerState.expanded) {
        expandButton.classList.add('is-expanded')
    }

    expandButton.addEventListener('click', () => {
        if (!layerState.enabled) return
        updateLayerState(layerState.layer, { expanded: !layerState.expanded })
    })

    header.append(left, expandButton)
    row.append(header)

    if (layerState.enabled && layerState.expanded) {
        row.append(createLayerDetails(layerState, state, option.description))
    }

    return row
}

function renderLayerRows(host: HTMLElement, state: Readonly<AppState>, dragState: DragState): void {
    host.innerHTML = ''

    for (const layerState of state.terrainLayerStates) {
        const option = LAYER_OPTIONS.find((entry) => entry.layer === layerState.layer)
        if (!option) continue
        host.append(createLayerRow(option, layerState, state, host, dragState))
    }
}

export function createLeftControlPanel(): HTMLElement {
    const panel = document.createElement('aside')
    panel.className = 'left-panel'
    panel.setAttribute('aria-label', 'Layers panel')

    const collapseButton = document.createElement('button')
    collapseButton.type = 'button'
    collapseButton.className = 'left-panel__collapse-btn'

    const collapseGlyph = document.createElement('span')
    collapseGlyph.className = 'left-panel__collapse-glyph'
    collapseGlyph.textContent = '›'
    collapseButton.append(collapseGlyph)

    const scroll = document.createElement('div')
    scroll.className = 'left-panel__scroll'

    const titleWrap = document.createElement('div')
    titleWrap.className = 'left-panel__title-wrap'

    const titleMain = document.createElement('div')
    titleMain.className = 'left-panel__title-main'

    const titleIcon = icon('mountain', 18)
    titleIcon.classList.add('left-panel__title-icon')

    const title = document.createElement('h1')
    title.className = 'left-panel__title'
    title.textContent = 'Layers'

    titleMain.append(titleIcon, title)
    titleWrap.append(titleMain, createThemeControls())

    const titleDescription = document.createElement('p')
    titleDescription.className = 'left-panel__title-description'
    titleDescription.textContent =
        'Check to show, drag to reorder (top row draws on top), then expand for controls.'

    const layerList = document.createElement('div')
    layerList.className = 'left-panel__layer-list'
    const dragState: DragState = { draggingLayer: null }
    renderLayerRows(layerList, appState.state, dragState)
    appState.subscribe((state) => {
        renderLayerRows(layerList, state, dragState)
    })

    let isCollapsed = localStorage.getItem('dtm-panel-collapsed') === '1'

    const MOBILE_BREAKPOINT = 980
    const hasPersistedPanelPreference = localStorage.getItem('dtm-panel-collapsed') !== null
    if (!hasPersistedPanelPreference && window.innerWidth < MOBILE_BREAKPOINT) {
        isCollapsed = true
    }

    if (window.innerWidth < MOBILE_BREAKPOINT && isCollapsed) {
        collapseButton.classList.add('left-panel__collapse-btn--attract')
    }

    const applyCollapsedState = (): void => {
        panel.classList.toggle('is-collapsed', isCollapsed)
        const container = panel.closest('.map-container')
        if (container) container.classList.toggle('is-panel-collapsed', isCollapsed)
        collapseGlyph.textContent = isCollapsed ? '›' : '‹'
        collapseButton.setAttribute('aria-label', isCollapsed ? 'Open controls panel' : 'Close controls panel')
        collapseButton.setAttribute('aria-expanded', String(!isCollapsed))
    }

    collapseButton.addEventListener('click', () => {
        collapseButton.classList.remove('left-panel__collapse-btn--attract')
        isCollapsed = !isCollapsed
        localStorage.setItem('dtm-panel-collapsed', isCollapsed ? '1' : '0')
        applyCollapsedState()
    })

    queueMicrotask(applyCollapsedState)

    scroll.append(
        titleWrap,
        titleDescription,
        layerList,
    )

    panel.append(collapseButton, scroll)
    return panel
}