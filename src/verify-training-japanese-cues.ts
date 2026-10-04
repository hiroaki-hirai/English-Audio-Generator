import { verifyTrainingJapaneseAssets } from './training-japanese-assets.js';

verifyTrainingJapaneseAssets().then(result => console.log(JSON.stringify(result))).catch((error: unknown) => {
  console.error('Japanese asset verification failed:', error instanceof Error ? error.message : 'unknown error');
  process.exitCode = 1;
});
