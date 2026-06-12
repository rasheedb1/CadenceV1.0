// Data-integrity smoke test for SlideLeadership.
// Run with: node src/components/slides/SlideLeadership.test.mjs
//
// Validates:
//   1. All photo paths resolve to real files under public/
//   2. All pedigree logo references resolve to real files under public/
//   3. Every logo in PEDIGREE_LOGOS has an entry in LOGO_SCALES
//   4. No duplicate people, no duplicate pedigree logos in the strip
//   5. Founders + Leaders totals 12 (the stat shown in the tagline)

import { strict as assert } from 'node:assert'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { FOUNDERS, LEADERS, PEDIGREE_LOGOS, LOGO_SCALES } from './SlideLeadership.data.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '../../../public')

const failures = []
function check(label, fn) {
  try {
    fn()
    console.log(`  ok  ${label}`)
  } catch (err) {
    failures.push({ label, err })
    console.log(`  FAIL ${label}`)
    console.log(`       ${err.message}`)
  }
}

console.log('SlideLeadership data-integrity checks\n')

// 1. Total headcount matches tagline
check('14 total operators (2 founders + 12 leaders)', () => {
  assert.equal(FOUNDERS.length, 2, `expected 2 founders, got ${FOUNDERS.length}`)
  assert.equal(LEADERS.length, 12, `expected 12 leaders, got ${LEADERS.length}`)
  assert.equal(FOUNDERS.length + LEADERS.length, 14)
})

// 2. Every photo resolves
const allPeople = [...FOUNDERS, ...LEADERS]
for (const p of allPeople) {
  check(`photo exists: ${p.name}`, () => {
    const abs = resolve(publicDir, p.photo.replace(/^\//, ''))
    assert.ok(existsSync(abs), `missing file: ${abs}`)
  })
}

// 3. Every person has a name and role
for (const p of allPeople) {
  check(`name+role set: ${p.name}`, () => {
    assert.ok(p.name?.length > 0)
    assert.ok(p.role?.length > 0)
  })
}

// 4. No duplicate people (by name)
check('no duplicate names', () => {
  const names = allPeople.map((p) => p.name)
  assert.equal(new Set(names).size, names.length, 'duplicate name detected')
})

// 5. Every inline-pedigree logo resolves
const inlineLogos = new Set()
for (const p of allPeople) {
  for (const logo of p.pedigree || []) {
    inlineLogos.add(logo)
  }
}
for (const logo of inlineLogos) {
  check(`inline pedigree logo exists: ${logo}`, () => {
    const abs = resolve(publicDir, 'company-logos', `${logo}.png`)
    assert.ok(existsSync(abs), `missing file: ${abs}`)
  })
}

// 6. Every strip logo resolves
for (const logo of PEDIGREE_LOGOS) {
  check(`strip logo exists: ${logo}`, () => {
    const abs = resolve(publicDir, 'company-logos', `${logo}.png`)
    assert.ok(existsSync(abs), `missing file: ${abs}`)
  })
}

// 7. Every strip logo has a LOGO_SCALES entry
for (const logo of PEDIGREE_LOGOS) {
  check(`LOGO_SCALES has entry for: ${logo}`, () => {
    assert.ok(LOGO_SCALES[logo] !== undefined, `missing scale for ${logo}`)
  })
}

// 8. No duplicates in the strip
check('no duplicate strip logos', () => {
  assert.equal(new Set(PEDIGREE_LOGOS).size, PEDIGREE_LOGOS.length)
})

// 9. Strip covers every inline pedigree logo (so the strip is a true superset)
for (const logo of inlineLogos) {
  check(`strip covers inline pedigree: ${logo}`, () => {
    assert.ok(
      PEDIGREE_LOGOS.includes(logo),
      `logo "${logo}" appears inline but not in the pedigree strip`,
    )
  })
}

console.log('')
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed.`)
  process.exit(1)
}
console.log(`All ${allPeople.length * 2 + PEDIGREE_LOGOS.length * 2 + inlineLogos.size * 2 + 4} checks passed.`)
