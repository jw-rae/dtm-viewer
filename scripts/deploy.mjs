/**
 * Copies the built dist/ into the host portfolio project.
 *
 * Configure destination via env var:
 *   DEPLOY_DEST=../../my-portfolio/public/apps/digital-terrain-model-viewer npm run deploy
 *
 * Falls back to the path below if env var is not set.
 */
import { cpSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(__dirname, '..', 'dist');

const dest = process.env.DEPLOY_DEST
    ? resolve(process.env.DEPLOY_DEST)
    : resolve(__dirname, '..', '..', 'jwpro-frontend', 'public', 'apps', 'digital-terrain-model-viewer');

if (!existsSync(srcDir)) {
    console.error('❌  dist/ not found — run build:deploy first');
    process.exit(1);
}

// Clear destination before copy so removed files don't linger
if (existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
}

cpSync(srcDir, dest, { recursive: true });
console.log(`✔  Deployed dist/ → ${dest}`);
