import { appState } from '../state/AppState.js'
import { DATASETS } from '../data/datasets.js'
import { icon, themePickerIcon } from './icons.js'

const THEMES = [
    { value: 'warm', label: 'Warm', color: '#777674' },
    { value: 'cool', label: 'Cool', color: '#71747e' },
    { value: 'pink', label: 'Pink', color: '#937886' },
    { value: 'green', label: 'Green', color: '#7c7e7c' },
    { value: 'blue', label: 'Blue', color: '#757b87' },
] as const

export function createHeaderBar(): HTMLElement {
    const header = document.createElement('header')
    header.className = 'header'

    const container = document.createElement('div')
    container.className = 'header-container'

    container.append(createLeft(), createRight())
    header.append(container)
    return header
}

// ── Left section ──────────────────────────────────────────────────────────────

function createLeft(): HTMLElement {
    const left = document.createElement('div')
    left.className = 'header-left'

    const logoIcon = icon('mountain', 26)
    logoIcon.classList.add('header-logo')

    const brand = document.createElement('div')
    brand.className = 'header-brand'

    const title = document.createElement('span')
    title.className = 'header-title'
    title.textContent = 'Digital Terrain Model Viewer'

    const subtitle = document.createElement('span')
    subtitle.className = 'header-subtitle'
    subtitle.textContent = 'Interactive terrain analysis & visualization'

    brand.append(title, subtitle)
    left.append(logoIcon, brand)
    return left
}

// ── Right section ─────────────────────────────────────────────────────────────

function createRight(): HTMLElement {
    const right = document.createElement('div')
    right.className = 'header-right'

    const divider = document.createElement('div')
    divider.className = 'header-divider'
    divider.setAttribute('aria-hidden', 'true')

    right.append(createDatasetSelector(), divider, createThemeControls())
    return right
}

// ── Dataset selector ──────────────────────────────────────────────────────────

function createDatasetSelector(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'dataset-selector'

    const label = document.createElement('label')
    label.className = 'dataset-label'
    label.htmlFor = 'ds-select'
    label.textContent = 'Dataset'

    const selectWrapper = document.createElement('div')
    selectWrapper.className = 'dataset-select-wrapper'

    const select = document.createElement('select')
    select.className = 'dataset-select'
    select.id = 'ds-select'

    for (const ds of DATASETS) {
        const opt = document.createElement('option')
        opt.value = ds.id
        opt.textContent = ds.label
        select.append(opt)
    }
    select.value = appState.state.currentDataset

    const chevron = icon('chevron_down', 14)
    chevron.classList.add('dataset-select-chevron')

    selectWrapper.append(select, chevron)
    wrapper.append(label, selectWrapper)

    select.addEventListener('change', () => {
        appState.update({ currentDataset: select.value })
    })

    appState.subscribe((state) => {
        if (select.value !== state.currentDataset) select.value = state.currentDataset
    })

    return wrapper
}

// ── Theme controls (dark/light toggle + colour picker) ────────────────────────

function createThemeControls(): HTMLElement {
    const group = document.createElement('div')
    group.className = 'controls-group'
    group.append(createDarkLightToggle(), createThemePicker())
    return group
}

function createDarkLightToggle(): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = 'theme-toggle'
    btn.setAttribute('type', 'button')

    const syncIcon = (scheme: string) => {
        btn.innerHTML = ''
        btn.appendChild(icon(scheme === 'dark' ? 'sun' : 'moon', 18))
        btn.setAttribute(
            'aria-label',
            scheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        )
    }

    syncIcon(appState.state.colorScheme)

    btn.addEventListener('click', () => {
        appState.update({ colorScheme: appState.state.colorScheme === 'dark' ? 'light' : 'dark' })
    })

    appState.subscribe((state) => syncIcon(state.colorScheme))

    return btn
}

function createThemePicker(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'theme-selector'

    const pickerBtn = document.createElement('button')
    pickerBtn.className = 'theme-selector-toggle'
    pickerBtn.setAttribute('type', 'button')
    pickerBtn.setAttribute('aria-label', 'Select colour theme')
    pickerBtn.setAttribute('aria-haspopup', 'true')
    pickerBtn.appendChild(themePickerIcon(18))

    const menu = document.createElement('div')
    menu.className = 'theme-menu theme-menu--hidden'
    menu.setAttribute('role', 'menu')

    const buildMenu = (currentTheme: string) => {
        menu.innerHTML = ''
        for (const t of THEMES) {
            const item = document.createElement('button')
            item.className = 'theme-menu-item' + (t.value === currentTheme ? ' is-active' : '')
            item.setAttribute('type', 'button')
            item.setAttribute('role', 'menuitem')

            const swatch = document.createElement('span')
            swatch.className = 'theme-color-swatch'
            swatch.style.backgroundColor = t.color

            const nameEl = document.createElement('span')
            nameEl.className = 'theme-name'
            nameEl.textContent = t.label

            item.append(swatch, nameEl)
            item.addEventListener('click', () => {
                appState.update({ theme: t.value })
                menu.classList.add('theme-menu--hidden')
            })
            menu.append(item)
        }
    }

    buildMenu(appState.state.theme)

    pickerBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const wasHidden = menu.classList.contains('theme-menu--hidden')
        menu.classList.toggle('theme-menu--hidden')
        if (wasHidden) buildMenu(appState.state.theme)
    })

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target as Node)) {
            menu.classList.add('theme-menu--hidden')
        }
    })

    wrapper.append(pickerBtn, menu)
    return wrapper
}
