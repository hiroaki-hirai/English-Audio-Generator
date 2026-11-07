import { capturePublished, initialCommit, saveObservation } from './legacy-retention.js';

async function main() {
  const args = process.argv.slice(2);
  const bootstrap = args.length === 0;
  if (!bootstrap && (args.length !== 4 || args[0] !== '--commit' || args[2] !== '--output')) throw new Error('Expected --commit <published SHA> --output <new store>');
  const captured = await capturePublished(bootstrap ? initialCommit : args[1]!);
  captured.record.acquisitionEvidence = bootstrap ? [
    'GitHub connector GET actions/runs?head_sha=811d93d1df635317981e9ef1b04661711ecbb10f: run 37218163285, main push, success.',
    'GitHub connector GET actions/runs/37218163285/artifacts: no available artifacts observed on 2026-11-07.',
    'GitHub connector GET releases?per_page=100: empty on 2026-11-07.',
    'Commit association supplied by repository owner and supported by successful workflow run; no independent original build bytes available.',
  ] : ['Post-publication live observation. Commit association explicitly supplied by operator; no independent original-build proof.'];
  const result = await saveObservation(bootstrap ? 'retained-assets' : args[3]!, captured);
  console.log(JSON.stringify({assurance: captured.record.assurance, files: result.files.size,
    bytes: [...result.files.values()].reduce((sum, file) => sum + file.bytes.length, 0), assets: captured.record.assets}));
}
main().catch((error: unknown) => { console.error('Retention capture HOLD:', error); process.exitCode = 1; });
