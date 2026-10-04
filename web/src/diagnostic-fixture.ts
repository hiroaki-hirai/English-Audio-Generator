import fixture from './diagnostic-cues.json' with { type: 'json' };

export const diagnosticLesson = fixture;
export const diagnosticCueCount = fixture.phrases.length;
export const diagnosticRoot = 'diagnostics/20-cue-background-test';
export function diagnosticJapanesePath(index: number): string {
  return `${diagnosticRoot}/japanese/phrase-${String(index + 1).padStart(3, '0')}.mp3`;
}
export function lessonMediaPath(id: string, file: 'lesson.mp3' | 'metadata.json'): string {
  return id === fixture.id
    ? `${diagnosticRoot}/${file === 'lesson.mp3' ? 'english/lesson.mp3' : file}`
    : `lessons/${id}/${file}`;
}
