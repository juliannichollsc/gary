// Regression test for engines/field-types.mjs (0 tokens, no network): node engines/field-types.test.mjs
// Cases come from real Indeed questions (2026-11-10). Add a case whenever a field type bites us.
import { coerce } from './field-types.mjs';
const T = [
  // [spec, answer, expected ok, expected value | null]
  [{ type: 'number' }, '8', true, '8'],
  [{ type: 'number' }, '8 years', true, '8'],
  [{ type: 'number' }, '1 - 4 years', false, null],                 // ambiguous → never "14"
  [{ type: 'number' }, 'No production BigQuery yet', false, null],  // text in a number field → refuse
  [{ type: 'number', min: 0, max: 50 }, '60', false, null],
  [{ type: 'number', step: '1' }, '2.5', false, null],
  [{ type: 'text', inputmode: 'numeric' }, '7 años', true, '7'],
  [{ type: 'radio', options: ['No experience', '1 - 4 years of experience', '5 years of experience or more'] }, '5 years of experience or more', true, '5 years of experience or more'],
  [{ type: 'radio', options: ['Yes', 'No'] }, 'Sí', true, 'Yes'],
  [{ type: 'radio', options: ['Yes', 'No'] }, 'Maybe later', false, null],
  [{ type: 'select', options: ['Colombia', 'Mexico'] }, 'colombia', true, 'Colombia'],
  [{ type: 'url' }, 'linkedin.com/in/someone', true, 'https://linkedin.com/in/someone'],
  [{ type: 'url' }, 'my profile', false, null],
  [{ type: 'email' }, 'a@b.co', true, 'a@b.co'],
  [{ type: 'tel' }, '+57 300 123 4567', true, '+573001234567'],
  [{ type: 'text', maxlength: 20 }, 'This answer is definitely longer than twenty', false, null],
  [{ type: 'textarea' }, 'I use Claude Code daily to scaffold tests and review diffs.', true, 'I use Claude Code daily to scaffold tests and review diffs.'],
  [{ type: 'date' }, '2027-03-01', true, '2027-03-01'],
];
let fail = 0;
for (const [spec, a, ok, val] of T) {
  const r = coerce(spec, a);
  const pass = r.ok === ok && (!ok || r.value === val);
  if (!pass) fail++;
  console.log(`${pass ? '✓' : '✗'} ${spec.type}${spec.inputmode ? '/' + spec.inputmode : ''} "${a}" → ${r.ok ? `"${r.value}"` : `REFUSED (${r.why})`}`);
}
console.log(fail ? `\n${fail} FAILED` : `\nall ${T.length} passed`);
process.exit(fail ? 1 : 0);
