import { appState } from '../state/AppState.js'
import { BASEMAPS } from '../data/basemaps.js'
import { icon } from './icons.js'

export function createBasemapSelector(): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'basemap-selector'

    // Toggle button — shows current basemap label
    const toggleBtn = document.createElement('button')
    toggleBtn.className = 'basemap-toggle'
    toggleBtn.setAttribute('type', 'button')
    toggleBtn.setAttribute('aria-label', 'Select basemap')
    toggleBtn.setAttribute('aria-haspopup', 'true')

    const layersIcon = icon('layers', 14)
    const labelEl = document.createElement('span')
    labelEl.className = 'basemap-toggle__label'

    const chevronIcon = icon('chevron_down', 12)
    chevronIcon.classList.add('basemap-toggle__chevron')

    toggleBtn.append(layersIcon, labelEl, chevronIcon)

    // Menu panel
    const menu = document.createElement('div')
    menu.className = 'basemap-menu basemap-menu--hidden'
    menu.setAttribute('role', 'menu')

    const menuTitle = document.createElement('p')
    menuTitle.className = 'basemap-menu__title'
    menuTitle.textContent = 'Basemap'
    menu.append(menuTitle)

    // Populate options
    const buildMenu = (currentId: string) => {
        // Clear old buttons, keep the title
        while (menu.children.length > 1) menu.removeChild(menu.lastChild!)

        for (const bm of BASEMAPS) {
            const item = document.createElement('button')
            item.className = 'basemap-item' + (bm.id === currentId ? ' is-active' : '')
            item.setAttribute('type', 'button')
            item.setAttribute('role', 'menuitem')
            item.textContent = bm.label
            item.addEventListener('click', () => {
                appState.update({ activeBasemap: bm.id })
                menu.classList.add('basemap-menu--hidden')
            })
            menu.append(item)
        }

        labelEl.textContent = BASEMAPS.find((b) => b.id === currentId)?.label ?? currentId
    }

    buildMenu(appState.state.activeBasemap)

    // Toggle panel visibility
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation()
        const hidden = menu.classList.contains('basemap-menu--hidden')
        menu.classList.toggle('basemap-menu--hidden')
        if (hidden) buildMenu(appState.state.activeBasemap)
    })

    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target as Node)) {
            menu.classList.add('basemap-menu--hidden')
        }
    })

    // React to state changes (e.g. programmatic updates in Step 3)
    appState.subscribe((state) => {
        labelEl.textContent = BASEMAPS.find((b) => b.id === state.activeBasemap)?.label ?? state.activeBasemap
    })

    wrapper.append(toggleBtn, menu)
    return wrapper
}
