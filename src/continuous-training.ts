import { createHash } from 'node:crypto';

export type ContinuousTrainingConfig = {
  repeatCount: number;
  repetitionIntervalSeconds: number;
  recallIntervalSeconds: number;
  sampleRate: number;
  codec: string;
  loudnessNormalization: {
    integratedLoudness: number;
    loudnessRange: number;
    truePeak: number;
  };
};

export const continuousTrainingConfig: ContinuousTrainingConfig = {
  repeatCount: 2,
  repetitionIntervalSeconds: 1,
  recallIntervalSeconds: 5,
  sampleRate: 24000,
  codec: 'libmp3lame',
  loudnessNormalization: {
    integratedLoudness: -16,
    loudnessRange: 7,
    truePeak: -1.5,
  },
};

export function calculateTrainingAudioSourceHash(
  trainingScript: Uint8Array,
  config: ContinuousTrainingConfig = continuousTrainingConfig,
): string {
  return createHash('sha256')
    .update(JSON.stringify(config))
    .update('\n')
    .update(trainingScript)
    .digest('hex');
}
