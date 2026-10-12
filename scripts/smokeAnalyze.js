/**
 * Smoke test for POST /api/admin/promotions/analyze with a REAL image and the
 * real Gemini API key. Usage: node scripts/smokeAnalyze.js <imagePath> [port]
 */
import fs from 'fs';
import path from 'path';

const imagePath = process.argv[2];
const port = process.argv[3] || '8787';

if (!imagePath || !fs.existsSync(imagePath)) {
  console.error('Usage: node scripts/smokeAnalyze.js <imagePath> [port]');
  process.exit(1);
}

const ext = path.extname(imagePath).toLowerCase();
const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
const base64 = fs.readFileSync(imagePath).toString('base64');

console.log(`📤 Sending ${imagePath} (${(base64.length / 1024).toFixed(0)} KB base64, ${mime}) to /api/admin/promotions/analyze ...`);

const res = await fetch(`http://localhost:${port}/api/admin/promotions/analyze`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ image_base64: `data:${mime};base64,${base64}` })
});

const data = await res.json().catch(() => null);
console.log(`HTTP ${res.status}`);
console.log(JSON.stringify(data, null, 2));

if (res.ok && data?.ok) {
  const p = data.promotion;
  const complete = ['bank_name', 'product_name', 'min_income', 'avg_3yr_rate', 'bank_ref_link'].every(k => p[k] !== undefined);
  console.log(`\n✅ Schema fields present: ${complete}`);
} else {
  console.log('\n❌ Analyze failed (see response above)');
  process.exit(2);
}
