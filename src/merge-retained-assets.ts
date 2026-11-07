import { mergeRetentionStores } from './legacy-retention.js';

const [option, output, ...sources] = process.argv.slice(2);
if (option !== '--output' || !output || sources.length < 2) throw new Error('Expected --output <new store> <existing store> <new observed store>');
mergeRetentionStores(output, sources).then(result => console.log(JSON.stringify({files: result.files.size,
  generations: result.generations.length, bytes: [...result.files.values()].reduce((n, file) => n + file.bytes.length, 0)})))
  .catch((error: unknown) => { console.error('Retention merge HOLD:', error); process.exitCode = 1; });
