import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calculateTrainingAudioSourceHash } from './continuous-training.js';
import { canonicalCompleteDeliverySource } from './complete-delivery-assets.js';

// Proven in Git history; this allowlist is audit-only, never used by audio generation.
// Pin both the saved hash and the exact LF Git blobs; do not accept arbitrary mismatches.
const historicalCases = [
  {
    "id": "basic-delivery",
    "saved": "5323da87641dcce04a2c54cc2531262afd1f07ce2873c5af18796ecd6d92fea3",
    "currentBlob": "b5c6daa40948a298f900c7de6309a08bb4cd7141",
    "historicalBlob": "b35203e500e66aea57ec24abef2b8aa7117d793d",
    "hashCommit": "a3067c22e4ff3ccf3d9f6f87d866a5533346136d",
    "lineEndings": "CRLF"
  },
  {
    "id": "cash-payment",
    "saved": "936868d046b0d4feba3a5960d099f744c7c232c3252942387433233ff4bd6ec2",
    "currentBlob": "030f88c0ab0089fd2225828978d4eb1966804172",
    "historicalBlob": "f1139276426969433f561b06cf8dafe987e22c30",
    "hashCommit": "a3067c22e4ff3ccf3d9f6f87d866a5533346136d",
    "lineEndings": "CRLF"
  },
  {
    "id": "change-handling",
    "saved": "63796c231617e4c1292380550605bd455bafd875a3195be40f697df3bf60e171",
    "currentBlob": "eade92ad51e2a87615f3430c46df2fc5a9f821d7",
    "historicalBlob": "b502eee45a5b00d0077c761f4f0ae45222e12aa0",
    "hashCommit": "a3067c22e4ff3ccf3d9f6f87d866a5533346136d",
    "lineEndings": "CRLF"
  },
  {
    "id": "giving-directions",
    "saved": "35deacd84c8eb4425f3f4265c4693c2ac2eb7ca296151f60df48fc31f43c12ee",
    "currentBlob": "8eff0fb334ed69263c8e1fd5e69114ede267e20b",
    "historicalBlob": "6da0aff6439dbfd42c888de49487c5ad22636d59",
    "hashCommit": "7b74720f4ef8fc6082331e98e3eabc600294aabe",
    "lineEndings": "LF"
  },
  {
    "id": "order-verification",
    "saved": "92b9b0b864b32b7d6ceb0f478d82cf67f8fae8ddce08cd1857e9be8319ce4a98",
    "currentBlob": "e4e8b9d451f354cb9aae469d56e25c80e25bb265",
    "historicalBlob": "45821e20431bb346d4a9f11d87fba1e46d342267",
    "hashCommit": "a3067c22e4ff3ccf3d9f6f87d866a5533346136d",
    "lineEndings": "CRLF"
  },
  {
    "id": "pin-verification",
    "saved": "a6be3bb75ddc952e6156f32b62bea70ca00f346b6d845110d5d4e421b4005803",
    "currentBlob": "e41717fd8e0f973122f63a13af47ede5a712c790",
    "historicalBlob": "0222c004d28b76dca5b550232289d635db06502e",
    "hashCommit": "a3067c22e4ff3ccf3d9f6f87d866a5533346136d",
    "lineEndings": "CRLF"
  },
  {
    "id": "restaurant-delay",
    "saved": "91342a9dbbe340204d48f8ff6d2338ba462c6949fb5767f8743b4f461a36a368",
    "currentBlob": "08c716c6677812f16e2179a89d199524f681b0c1",
    "historicalBlob": "86cf978f1577b7b36c32eee253b7b24b98383b25",
    "hashCommit": "a3067c22e4ff3ccf3d9f6f87d866a5533346136d",
    "lineEndings": "CRLF"
  }
] as const;

function gitBlob(bytes: Buffer): string {
  return createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
}
function verifySourceHash(id: string, raw: Buffer, saved: string): 'MATCH' | 'HISTORICAL_DOMAIN_ADDITION' {
  const known = historicalCases.find(item => item.id === id);
  if (known) {
    // Reconstruct only the exact, documented domain-only edit. Preserve all other bytes.
    const lf = Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    assert.equal(gitBlob(lf), known.currentBlob, 'Historical source changed: ' + id);
    assert.equal(saved, known.saved, 'Historical saved hash changed: ' + id);
    const oldLf = Buffer.from(lf.toString('utf8').replace(/^  "domain": "(?:delivery|everyday)",\n/m, ''));
    assert.equal(gitBlob(oldLf), known.historicalBlob, 'Historical reconstruction changed');
    const original = known.lineEndings === 'CRLF' ? Buffer.from(oldLf.toString('utf8').replace(/\n/g, '\r\n')) : oldLf;
    assert.equal(calculateTrainingAudioSourceHash(original), saved, 'Historical hash no longer reproducible');
    return 'HISTORICAL_DOMAIN_ADDITION';
  }
  const source = id === 'complete-delivery' ? canonicalCompleteDeliverySource(raw) : raw;
  assert.equal(calculateTrainingAudioSourceHash(source), saved, 'Unrecognized source hash mismatch: ' + id);
  return 'MATCH';
}

for (const item of historicalCases) {
  test('reproduces pinned historical source hash without changing source bytes: ' + item.id, () => {
    const raw = readFileSync('training-scripts/' + item.id + '.json');
    const saved = readFileSync('web/public/lessons/' + item.id + '/source-hash.txt', 'utf8').trim();
    assert.equal(verifySourceHash(item.id, raw, saved), 'HISTORICAL_DOMAIN_ADDITION');
    const lf = Buffer.from(raw.toString().replace(/\r\n/g, '\n'));
    assert.equal(verifySourceHash(item.id, lf, saved), 'HISTORICAL_DOMAIN_ADDITION');
    assert.throws(() => verifySourceHash(item.id, Buffer.concat([raw, Buffer.from(' ')]), saved), /source changed/);
    assert.throws(() => verifySourceHash(item.id, raw, '0'.repeat(64)), /saved hash changed/);
  });
}

test('all 20 lessons require an exact current hash or one of seven byte-pinned historical cases', () => {
  const lessons = JSON.parse(readFileSync('web/src/training-lessons.json', 'utf8')) as Array<{id: string}>;
  assert.equal(lessons.length, 20);
  const results = lessons.map(({id}) => ({id, result: verifySourceHash(id,
    readFileSync('training-scripts/' + id + '.json'),
    readFileSync('web/public/lessons/' + id + '/source-hash.txt', 'utf8').trim())}));
  assert.equal(results.filter(item => item.result === 'MATCH').length, 13);
  assert.deepEqual(results.filter(item => item.result !== 'MATCH').map(item => item.id).sort(), historicalCases.map(item => item.id).sort());
  assert.throws(() => verifySourceHash('new-lesson', Buffer.from('{}'), historicalCases[0].saved), /Unrecognized/);
});
