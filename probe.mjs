import { fromFile } from 'geotiff'
import proj4 from 'proj4'

proj4.defs('EPSG:26913', '+proj=utm +zone=13 +datum=NAD83 +units=m +no_defs')

const tiff = await fromFile('./public/data/USGS_1M_13_x43y444_CO_NorthwestCO_2020_D20.tif')
const img = await tiff.getImage()
const [minX, minY, maxX, maxY] = img.getBoundingBox()

const toWGS84 = proj4('EPSG:26913', 'WGS84')
const [west, south] = toWGS84.forward([minX, minY])
const [east, north] = toWGS84.forward([maxX, maxY])

console.log('Width:', img.getWidth(), 'Height:', img.getHeight())
console.log('UTM BBox:', [minX, minY, maxX, maxY])
console.log('WGS84 bounds: [west, south, east, north]')
console.log(JSON.stringify([west, south, east, north]))
console.log('Center lon/lat:', [(west + east) / 2, (south + north) / 2])
