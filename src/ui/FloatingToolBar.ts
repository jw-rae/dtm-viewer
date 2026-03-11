import { appState } from '../state/AppState.js'
import { TerrainLayer } from '../types/index.js'
import type { SlopeUnit } from '../types/index.js'
import { icon } from './icons.js'
import type { IconName } from './icons.js'
import { SLOPE_GRADIENT_CSS } from '../renderer/SlopeService.js'
import { ASPECT_CONIC_CSS, ASPECT_LINEAR_CSS } from '../renderer/AspectService.js'
import type { HillshadeParams } from '../renderer/HillshadeService.js'
import { sunPositionToAngles } from '../renderer/HillshadeService.js'

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
        description: 'Shaded relief from a simulated directional light source. Illumination angle and shadows reveal surface texture and topographic form.',
        implemented: true,
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
        description: 'Rate of elevation change per unit distance computed with Horn\'s 3×3 finite-difference method. Steeper gradients highlight terrain severity and runoff risk.',
        implemented: true,
    },
    {
        layer: TerrainLayer.Aspect,
        label: 'Aspect',
        iconName: 'compass',
        description: 'Compass direction each downhill-facing surface cell points toward, computed with Horn\'s 3×3 finite-difference method. Useful for solar exposure and hydrological analysis.',
        implemented: true,
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

    // Slope — unit toggle + colour palette legend
    if (layer === TerrainLayer.Slope) {
        const divider2 = document.createElement('div')
        divider2.className = 'tool-popup__divider'
        popup.append(divider2)

        // Unit segmented control
        const unitSection = document.createElement('div')
        unitSection.className = 'tool-popup__section'

        const unitTitle = document.createElement('div')
        unitTitle.className = 'tool-popup__section-title'
        unitTitle.textContent = 'Measurement'

        const seg = document.createElement('div')
        seg.className = 'tool-popup__seg'

        const unitOptions: Array<{ unit: SlopeUnit; label: string }> = [
            { unit: 'degree',  label: 'Degrees' },
            { unit: 'percent', label: '% Rise' },
        ]
        for (const opt of unitOptions) {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'tool-popup__seg-btn'
            btn.textContent = opt.label
            if (appState.state.slopeUnit === opt.unit) btn.classList.add('is-active')
            btn.addEventListener('click', () => appState.update({ slopeUnit: opt.unit }))
            seg.append(btn)
        }
        unitSection.append(unitTitle, seg)
        popup.append(unitSection)

        // Colour legend
        const divider3 = document.createElement('div')
        divider3.className = 'tool-popup__divider'
        popup.append(divider3)

        const legendSection = document.createElement('div')
        legendSection.className = 'tool-popup__section'

        const legendTitle = document.createElement('div')
        legendTitle.className = 'tool-popup__section-title'
        legendTitle.textContent = 'Slope Legend'

        const gradient = document.createElement('div')
        gradient.className = 'tool-popup__gradient'
        gradient.style.background = SLOPE_GRADIENT_CSS

        const labels = document.createElement('div')
        labels.className = 'tool-popup__gradient-labels tool-popup__gradient-labels--3'
        const isDeg = appState.state.slopeUnit === 'degree'
        const [l0, lMid, lMax] = isDeg
            ? ['0°', '45°', '90°']
            : ['0%', '100%', '\u221e']
        for (const txt of [l0, lMid, lMax]) {
            const s = document.createElement('span')
            s.textContent = txt
            labels.append(s)
        }

        legendSection.append(legendTitle, gradient, labels)
        popup.append(legendSection)
    }

    // Aspect — compass rose + strip legend
    if (layer === TerrainLayer.Aspect) {
        const divider2 = document.createElement('div')
        divider2.className = 'tool-popup__divider'
        popup.append(divider2)

        const legendSection = document.createElement('div')
        legendSection.className = 'tool-popup__section'

        const legendTitle = document.createElement('div')
        legendTitle.className = 'tool-popup__section-title'
        legendTitle.textContent = 'Aspect Legend'

        // Compass rose
        const rose = document.createElement('div')
        rose.className = 'tool-popup__aspect-rose'
        rose.style.background = ASPECT_CONIC_CSS

        // Cardinal labels around the rose
        const cardinals = document.createElement('div')
        cardinals.className = 'tool-popup__aspect-cardinals'
        for (const label of ['N', 'E', 'S', 'W']) {
            const span = document.createElement('span')
            span.className = `tool-popup__cardinal tool-popup__cardinal--${label.toLowerCase()}`
            span.textContent = label
            cardinals.append(span)
        }

        // Strip gradient beneath the rose
        const strip = document.createElement('div')
        strip.className = 'tool-popup__gradient'
        strip.style.background = ASPECT_LINEAR_CSS

        const stripLabels = document.createElement('div')
        stripLabels.className = 'tool-popup__gradient-labels tool-popup__gradient-labels--3'
        for (const txt of ['N (0°)', 'S (180°)', 'N (360°)']) {
            const s = document.createElement('span')
            s.textContent = txt
            stripLabels.append(s)
        }

        // Flat cell note
        const flatNote = document.createElement('p')
        flatNote.className = 'tool-popup__flat-note'
        flatNote.textContent = 'Flat cells are shown in grey (−1).'

        legendSection.append(legendTitle, rose, cardinals, strip, stripLabels, flatNote)
        popup.append(legendSection)
    }

    // Hillshade — sun arc widget + z-factor + shadow toggle
    if (layer === TerrainLayer.Hillshade) {
        const divider2 = document.createElement('div')
        divider2.className = 'tool-popup__divider'
        popup.append(divider2)

        const paramsSection = document.createElement('div')
        paramsSection.className = 'tool-popup__section'

        // ── Sun position title
        const sunTitle = document.createElement('div')
        sunTitle.className = 'tool-popup__section-title'
        sunTitle.textContent = 'Sun Position'

        // ── SVG arc diagram
        const SVG_NS = 'http://www.w3.org/2000/svg'
        const svg = document.createElementNS(SVG_NS, 'svg')
        svg.setAttribute('viewBox', '0 0 200 115')
        svg.setAttribute('width', '100%')
        svg.setAttribute('aria-hidden', 'true')
        svg.style.display = 'block'
        svg.style.marginBottom = '2px'

        // Horizon line
        const horizonLine = document.createElementNS(SVG_NS, 'line')
        horizonLine.setAttribute('x1', '10')
        horizonLine.setAttribute('y1', '100')
        horizonLine.setAttribute('x2', '190')
        horizonLine.setAttribute('y2', '100')
        horizonLine.setAttribute('class', 'sun-arc__horizon')

        // Arc path — semicircle E→top→W
        const arcPath = document.createElementNS(SVG_NS, 'path')
        arcPath.setAttribute('d', 'M 20,100 A 80,80 0 0 1 180,100')
        arcPath.setAttribute('class', 'sun-arc__arc-path')

        // Noon tick
        const noonTick = document.createElementNS(SVG_NS, 'line')
        noonTick.setAttribute('x1', '96')
        noonTick.setAttribute('y1', '19')
        noonTick.setAttribute('x2', '104')
        noonTick.setAttribute('y2', '19')
        noonTick.setAttribute('class', 'sun-arc__tick')

        // Labels
        function svgText(x: string, y: string, txt: string, anchor = 'middle'): SVGTextElement {
            const el = document.createElementNS(SVG_NS, 'text')
            el.setAttribute('x', x)
            el.setAttribute('y', y)
            el.setAttribute('text-anchor', anchor)
            el.setAttribute('class', 'sun-arc__label')
            el.textContent = txt
            return el
        }
        const eLabel  = svgText('10',  '113', 'E', 'middle')
        const sLabel  = svgText('100',  '14', 'S', 'middle')
        const wLabel  = svgText('190', '113', 'W', 'middle')

        // Sun glow + dot (rendered last so they sit on top)
        const glow = document.createElementNS(SVG_NS, 'circle')
        glow.setAttribute('r', '13')
        glow.setAttribute('class', 'sun-arc__glow')

        const sunDot = document.createElementNS(SVG_NS, 'circle')
        sunDot.setAttribute('r', '7')
        sunDot.setAttribute('class', 'sun-arc__sun')

        svg.append(horizonLine, arcPath, noonTick, eLabel, sLabel, wLabel, glow, sunDot)

        // ── Computed angles display
        const computedInfo = document.createElement('div')
        computedInfo.className = 'tool-popup__sun-computed'

        function updateArcDisplay(pos: number): void {
            const t = pos / 100
            const angle = Math.PI * (1 - t)
            const cx = (100 + 80 * Math.cos(angle)).toFixed(1)
            const cy = (100 - 80 * Math.sin(angle)).toFixed(1)
            sunDot.setAttribute('cx', cx)
            sunDot.setAttribute('cy', cy)
            glow.setAttribute('cx', cx)
            glow.setAttribute('cy', cy)
            const { azimuth, altitude } = sunPositionToAngles(pos)
            computedInfo.textContent =
                `Azimuth ${Math.round(azimuth)}° · Altitude ${Math.round(Math.max(0, altitude))}°`
        }

        updateArcDisplay(appState.state.hillshadeParams.sunPosition)

        // ── Position slider
        const sunSlider = document.createElement('input')
        sunSlider.type = 'range'
        sunSlider.className = 'tool-popup__slider'
        sunSlider.min = '0'
        sunSlider.max = '100'
        sunSlider.step = '1'
        sunSlider.value = String(appState.state.hillshadeParams.sunPosition)
        sunSlider.addEventListener('input', () => {
            const pos = Number(sunSlider.value)
            updateArcDisplay(pos)
            appState.update({
                hillshadeParams: { ...appState.state.hillshadeParams, sunPosition: pos },
            })
        })

        // Time-of-day labels beneath slider
        const timeLabels = document.createElement('div')
        timeLabels.className = 'tool-popup__gradient-labels tool-popup__gradient-labels--3'
        for (const txt of ['Sunrise', 'Noon', 'Sunset']) {
            const s = document.createElement('span')
            s.textContent = txt
            timeLabels.append(s)
        }

        paramsSection.append(sunTitle, svg, sunSlider, timeLabels, computedInfo)
        popup.append(paramsSection)

        // ── Z Factor + shadow section
        const divider3 = document.createElement('div')
        divider3.className = 'tool-popup__divider'
        popup.append(divider3)

        const techSection = document.createElement('div')
        techSection.className = 'tool-popup__section'

        // Z Factor slider
        function makeSlider(
            labelText: string,
            min: number, max: number, step: number,
            getValue: () => number,
            setter: (v: number) => Partial<HillshadeParams>,
            format: (v: number) => string = (v) => String(v),
        ): HTMLElement {
            const row = document.createElement('div')
            row.className = 'tool-popup__slider-row'
            const lbl = document.createElement('label')
            lbl.className = 'tool-popup__slider-label'
            lbl.textContent = labelText
            const val = document.createElement('span')
            val.className = 'tool-popup__slider-value'
            val.textContent = format(getValue())
            const slider = document.createElement('input')
            slider.type = 'range'
            slider.className = 'tool-popup__slider'
            slider.min = String(min)
            slider.max = String(max)
            slider.step = String(step)
            slider.value = String(getValue())
            slider.addEventListener('input', () => {
                const n = Number(slider.value)
                val.textContent = format(n)
                appState.update({
                    hillshadeParams: { ...appState.state.hillshadeParams, ...setter(n) },
                })
            })
            row.append(lbl, val, slider)
            return row
        }

        techSection.append(
            makeSlider(
                'Z Factor', 0.1, 5, 0.1,
                () => appState.state.hillshadeParams.zFactor,
                (v) => ({ zFactor: v }),
                (v) => v.toFixed(1),
            ),
        )

        // Shadow toggle
        const hp = appState.state.hillshadeParams
        const shadowRow = document.createElement('div')
        shadowRow.className = 'tool-popup__toggle-row'
        const shadowLabel = document.createElement('span')
        shadowLabel.className = 'tool-popup__toggle-label'
        shadowLabel.textContent = 'Model Shadows'
        const shadowToggle = document.createElement('button')
        shadowToggle.type = 'button'
        shadowToggle.className = 'tool-popup__toggle'
        if (hp.modelShadows) shadowToggle.classList.add('is-on')
        shadowToggle.setAttribute('aria-pressed', String(hp.modelShadows))
        shadowToggle.setAttribute('aria-label', 'Toggle shadow modelling')
        const track = document.createElement('span')
        track.className = 'tool-popup__toggle-track'
        const thumb = document.createElement('span')
        thumb.className = 'tool-popup__toggle-thumb'
        track.append(thumb)
        shadowToggle.append(track)
        shadowToggle.addEventListener('click', () => {
            const next = !appState.state.hillshadeParams.modelShadows
            appState.update({
                hillshadeParams: { ...appState.state.hillshadeParams, modelShadows: next },
            })
            shadowToggle.classList.toggle('is-on', next)
            shadowToggle.setAttribute('aria-pressed', String(next))
        })
        shadowRow.append(shadowLabel, shadowToggle)
        techSection.append(shadowRow)
        popup.append(techSection)
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

    // Track what matters for popup rebuilds
    let prevActiveLayerForPopup = appState.state.activeTerrainLayer
    let prevElevRange = appState.state.elevationRange
    let prevSlopeUnit = appState.state.slopeUnit

    appState.subscribe((state) => {
        buttons.forEach((btn, i) => {
            btn.classList.toggle('is-active', TOOLS[i].layer === state.activeTerrainLayer)
        })
        if (popupOpen) {
            // Skip rebuild for hillshadeParams-only changes — the sun arc + sliders
            // update themselves in-place via their own event handlers.
            const needsRebuild =
                state.activeTerrainLayer !== prevActiveLayerForPopup ||
                state.elevationRange !== prevElevRange ||
                state.slopeUnit !== prevSlopeUnit
            if (needsRebuild) {
                buildPopupContent(state.activeTerrainLayer, popup)
            }
        }
        prevActiveLayerForPopup = state.activeTerrainLayer
        prevElevRange = state.elevationRange
        prevSlopeUnit = state.slopeUnit
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

