import VectorLayer from 'ol/layer/Vector.js'
import VectorSource from 'ol/source/Vector.js'
import Feature from 'ol/Feature.js'
import { fromExtent } from 'ol/geom/Polygon.js'
import { transformExtent } from 'ol/proj.js'
import { Style, Stroke, Fill } from 'ol/style.js'

// ── createBBoxLayer ────────────────────────────────────────────────────────────

/** Draws the dataset bounding box as a dashed rectangle on the map. */
export function createBBoxLayer(
    bounds4326: [number, number, number, number],
): VectorLayer<VectorSource> {
    const extent3857 = transformExtent(bounds4326, 'EPSG:4326', 'EPSG:3857')
    const polygon = fromExtent(extent3857)
    const feature = new Feature(polygon)

    const source = new VectorSource({ features: [feature] })

    return new VectorLayer<VectorSource>({
        source,
        zIndex: 11,
        style: new Style({
            stroke: new Stroke({
                color: 'rgba(255, 80, 80, 0.9)',
                width: 2,
                lineDash: [8, 6],
            }),
            fill: new Fill({
                color: 'rgba(255, 80, 80, 0.06)',
            }),
        }),
    })
}
