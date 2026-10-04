export function trainingJapaneseCueMp3Path(lessonId: string, phraseIndex: number): string {
  if (!/^[a-z0-9-]+$/.test(lessonId) || !Number.isInteger(phraseIndex) || phraseIndex < 0) {
    throw new Error('Invalid Japanese cue identity.');
  }
  return `lessons/${lessonId}/japanese-cues/phrase-${String(phraseIndex + 1).padStart(3, '0')}.mp3`;
}
