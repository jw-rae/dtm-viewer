// scripts/patch-design-tokens.js
//
// The published @jwrae/design-tokens@1.0.x package ships with a truncated
// themes.css that is missing two closing braces at the end of file, which
// causes PostCSS to report an "Unclosed block" error during the Vite build.
//
// This postinstall patch detects whether the file is still broken and appends
// the missing braces so the build succeeds.

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const themesPath = join(
    __dirname,
    '../node_modules/@jwrae/design-tokens/css/themes.css'
)

let source = readFileSync(themesPath, 'utf8')

// Check if the final @media block is already properly closed
if (!source.trimEnd().endsWith('}')) {
    source = source.trimEnd() + '\n  }\n}\n'
    writeFileSync(themesPath, source, 'utf8')
    console.log('✔  Patched @jwrae/design-tokens/css/themes.css (added missing closing braces)')
} else {
    console.log('✔  @jwrae/design-tokens/css/themes.css already correct — no patch needed')
}
