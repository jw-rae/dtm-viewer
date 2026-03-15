import proj4 from 'proj4'

// ── EPSG definition registry ───────────────────────────────────────────────────
// Auto-registers well-known CRS families on demand so any USGS / OS DEM loads
// without manual config. Add new blocks here if you need other systems.

function ensureEpsgDef(epsgCode: number): string {
    const key = `EPSG:${epsgCode}`
    if (proj4.defs(key)) return key

    // WGS84 UTM North  32601–32660
    if (epsgCode >= 32601 && epsgCode <= 32660) {
        proj4.defs(key, `+proj=utm +zone=${epsgCode - 32600} +datum=WGS84 +units=m +no_defs`)
        return key
    }
    // WGS84 UTM South  32701–32760
    if (epsgCode >= 32701 && epsgCode <= 32760) {
        proj4.defs(key, `+proj=utm +zone=${epsgCode - 32700} +south +datum=WGS84 +units=m +no_defs`)
        return key
    }
    // NAD83 UTM North  26901–26960
    if (epsgCode >= 26901 && epsgCode <= 26960) {
        proj4.defs(key, `+proj=utm +zone=${epsgCode - 26900} +datum=NAD83 +units=m +no_defs`)
        return key
    }
    // British National Grid
    if (epsgCode === 27700) {
        proj4.defs(key, '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +datum=OSGB36 +units=m +no_defs')
        return key
    }

    throw new Error(`EPSG:${epsgCode}`)
}

// ── fetchAndRegisterEpsg ──────────────────────────────────────────────────────
// For any CRS not covered by the static rules above, fetch the proj4 string
// from epsg.io at runtime and register it on the fly.

async function fetchAndRegisterEpsg(epsgCode: number): Promise<string> {
    const key = `EPSG:${epsgCode}`
    if (proj4.defs(key)) return key

    const response = await fetch(`https://epsg.io/${epsgCode}.proj4`)
    if (!response.ok) {
        throw new Error(`Could not fetch projection for EPSG:${epsgCode} (HTTP ${response.status})`)
    }
    const proj4str = (await response.text()).trim()
    if (!proj4str || proj4str.startsWith('<!')) {
        throw new Error(`No proj4 definition found for EPSG:${epsgCode}`)
    }
    proj4.defs(key, proj4str)
    return key
}

// ── bboxToWgs84 ───────────────────────────────────────────────────────────────

/**
 * Converts a native bounding box [minX, minY, maxX, maxY] from the given CRS
 * (described by EPSG code + GeoKeys) to WGS84 [west, south, east, north].
 *
 * Works for geographic (lat/lon), projected (UTM, etc.), and registered
 * national grids. Returns the input unchanged for EPSG:4326 / 4269.
 */
export async function bboxToWgs84(
    bbox: [number, number, number, number],
    epsgCode: number,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    geoKeys: any,
): Promise<[number, number, number, number]> {
    const isGeographic =
        geoKeys.GTModelTypeGeoKey === 2 ||
        epsgCode === 4326 ||
        epsgCode === 4269

    if (isGeographic) {
        return [bbox[0], bbox[1], bbox[2], bbox[3]]
    }

    let projKey: string
    try {
        projKey = ensureEpsgDef(epsgCode)
    } catch {
        projKey = await fetchAndRegisterEpsg(epsgCode)
    }

    const toWGS84 = proj4(projKey, 'WGS84')
    const sw = toWGS84.forward([bbox[0], bbox[1]])
    const ne = toWGS84.forward([bbox[2], bbox[3]])
    return [sw[0], sw[1], ne[0], ne[1]]
}
