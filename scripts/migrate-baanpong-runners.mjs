// One-off migration script: Baanpong Trail 2026 runner import.
//
// Reads the athlete-list Excel file and emits batched SQL files (to a given
// output directory) that create categories and runners for one event. This
// mirrors src/pages/ImportRunners.jsx's parsing and field mapping exactly —
// same column indices, same category regex, same field names — so a later
// browser-driven import for the same event recognizes the same category
// names instead of creating duplicates.
//
// This script does NOT touch the database itself (no service role key is
// available in this environment). It only reads the local xlsx file and
// writes SQL text to disk; the SQL is reviewed and executed separately via
// the Supabase MCP (mcp__supabase__execute_sql), one batch at a time.
//
// Usage:
//   node scripts/migrate-baanpong-runners.mjs --event-id=<uuid> --out=<dir>

import XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'node:fs';

const XLSX_PATH = '/Users/giggong/Desktop/ai-whale/data/excel/Athlete-List-Baanpong-2026-28-7-69-final.xlsx';
const BATCH_SIZE = 200;

function sqlQuote(value) {
  if (value === null || value === undefined) return 'null';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlNumberOrNull(value) {
  return value === null || value === undefined || Number.isNaN(value) ? 'null' : String(value);
}

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, ...rest] = arg.replace(/^--/, '').split('=');
      return [key, rest.join('=')];
    }),
  );
  return { eventId: args['event-id'] ?? null, outDir: args.out ?? '.' };
}

// Same column-index parsing as ImportRunners.jsx:handleExcelUpload, verified
// against the actual header row of this file before writing this script.
function parseRows() {
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1 });

  return json
    .slice(1)
    .filter((r) => r.length > 0 && String(r[2] || '').trim() !== '')
    .map((row) => {
      const title = String(row[1] || '').trim();
      const name = String(row[2] || '').trim();
      const rawCat = String(row[4] || '').trim();

      let distance = null;
      let unit = '';
      let catName = rawCat;

      // Same regex as ImportRunners.jsx, e.g. "10 KM : Hard Rock"
      const catMatch = rawCat.match(/^([\d.]+)\s*([a-zA-Z]+)\s*:\s*(.*)$/);
      if (catMatch) {
        distance = parseFloat(catMatch[1]);
        unit = catMatch[2];
        catName = catMatch[3].trim();
      }

      return {
        title,
        name,
        gender: String(row[3] || '').trim() || 'M',
        cat: rawCat,
        distance,
        unit,
        catName,
        paymentStatus: String(row[5] || '').trim(),
        ageGroup: String(row[6] || '').trim() || 'N/A',
        age: String(row[6] || '').trim() || 'N/A',
        nat: 'THAI',
      };
    });
}

function uniqueCategories(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.cat)) {
      map.set(row.cat, { name: row.catName, distanceKm: row.distance ?? 0, unit: row.unit || 'km' });
    }
  }
  return [...map.values()];
}

function runnerValuesTuple(row) {
  return `(${sqlQuote(row.title)}, ${sqlQuote(row.name)}, ${sqlQuote(row.gender)}, ${sqlQuote(row.age)}, ${sqlQuote(row.ageGroup)}, ${sqlQuote(row.cat)}, ${sqlNumberOrNull(row.distance)}, ${sqlQuote(row.unit)}, ${sqlQuote(row.catName)}, ${sqlQuote(row.paymentStatus)})`;
}

function buildBatch1Sql(eventId, categories, batchRows) {
  const catValues = categories
    .map((c) => `  (${sqlQuote(eventId)}, ${sqlQuote(c.name)}, ${sqlNumberOrNull(c.distanceKm)}, ${sqlQuote(c.unit)})`)
    .join(',\n');

  const runnerValues = batchRows.map(runnerValuesTuple).join(',\n');

  return `-- Batch 1: creates all categories for the event, then inserts the first
-- chunk of runners, resolving category_id via the CTE (same-statement join,
-- no round trip needed).
with new_cats as (
  insert into public.categories (event_id, name, distance_km, unit)
  values
${catValues}
  returning id, name
)
insert into public.runners
  (event_id, bib, title, name, gender, age, age_group, cat, distance, unit,
   cat_name, nat, payment_status, category_id, registration_status)
select
  ${sqlQuote(eventId)}, null, v.title, v.name, v.gender, v.age, v.age_group,
  v.cat, v.distance, v.unit, v.cat_name, 'THAI', v.payment_status, nc.id,
  'PRE_REGISTERED'
from (values
${runnerValues}
) as v(title, name, gender, age, age_group, cat, distance, unit, cat_name, payment_status)
join new_cats nc on nc.name = v.cat_name
returning id;
`;
}

function buildFollowupBatchSql(eventId, batchNumber, batchRows) {
  const runnerValues = batchRows.map(runnerValuesTuple).join(',\n');

  return `-- Batch ${batchNumber}: categories already exist from batch 1 (same event),
-- join public.categories directly by (event_id, name).
insert into public.runners
  (event_id, bib, title, name, gender, age, age_group, cat, distance, unit,
   cat_name, nat, payment_status, category_id, registration_status)
select
  ${sqlQuote(eventId)}, null, v.title, v.name, v.gender, v.age, v.age_group,
  v.cat, v.distance, v.unit, v.cat_name, 'THAI', v.payment_status, c.id,
  'PRE_REGISTERED'
from (values
${runnerValues}
) as v(title, name, gender, age, age_group, cat, distance, unit, cat_name, payment_status)
join public.categories c on c.event_id = ${sqlQuote(eventId)} and c.name = v.cat_name
returning id;
`;
}

function main() {
  const { eventId, outDir } = parseArgs();
  const rows = parseRows();
  const categories = uniqueCategories(rows);

  if (!eventId) {
    console.log(JSON.stringify(
      {
        totalRows: rows.length,
        uniqueCategoryCount: categories.length,
        categories: categories.map((c) => `${c.distanceKm}${c.unit} : ${c.name}`),
        sampleRow: rows[0],
      },
      null,
      2,
    ));
    console.log('\nNo --event-id given: dry-run only, no SQL written. Pass --event-id=<uuid> --out=<dir> to generate batch SQL files.');
    return;
  }

  mkdirSync(outDir, { recursive: true });

  const batches = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) batches.push(rows.slice(i, i + BATCH_SIZE));

  batches.forEach((batchRows, index) => {
    const sql = index === 0
      ? buildBatch1Sql(eventId, categories, batchRows)
      : buildFollowupBatchSql(eventId, index + 1, batchRows);
    const path = `${outDir}/batch_${index + 1}.sql`;
    writeFileSync(path, sql, 'utf8');
    console.log(`wrote ${path} (${batchRows.length} runners)`);
  });

  console.log(`\nTotal: ${rows.length} runners across ${batches.length} batches, ${categories.length} categories.`);
}

main();
