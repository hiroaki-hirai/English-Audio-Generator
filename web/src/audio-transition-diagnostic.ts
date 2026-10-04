export const audioTransitionEventLimit = 4000;
type PlaybackType = 'Japanese MP3' | 'English';
type Snapshot = {
  time: number;
  visibility: string;
  isActive: boolean | undefined;
  hasBeenActive: boolean | undefined;
  readyState: number;
  networkState: number;
  paused: boolean;
  currentTime: number;
  src: string;
  currentSrc: string;
  owner: string;
  runtimeActive: boolean;
  queueIndex: number | null;
  element: object;
  errorCode: number | null;
  errorMessage: string;
};

// Observations only: never calls play/load/seek or changes playback ownership.
export function createAudioTransitionDiagnostic(sample: () => Snapshot) {
  let events: string[] = [];
  let previousPlayback: PlaybackType | 'none' = 'none';
  let playRequest = 0;
  const elementIds = new WeakMap<object, number>();
  let nextElementId = 1;
  return {
    reset(): void { events = []; previousPlayback = 'none'; },
    record(kind: string, detail = '', playback?: PlaybackType): number {
      if (kind === 'english play-call') playRequest += 1;
      try {
        const state = sample();
        let elementId = elementIds.get(state.element);
        if (elementId === undefined) {
          elementId = nextElementId++;
          elementIds.set(state.element, elementId);
        }
        events.push(`${kind} @${state.time.toFixed(1)}ms ${detail}\n  ${JSON.stringify({
          ...state, element: `english-${elementId}`, previousPlayback, playRequest,
          isActive: state.isActive ?? 'unavailable',
          hasBeenActive: state.hasBeenActive ?? 'unavailable',
        })}`);
        events = events.slice(-audioTransitionEventLimit);
        if (playback) previousPlayback = playback;
      } catch {
        // Unavailable APIs or diagnostic failures must not affect playback.
      }
      return playRequest;
    },
    lines(): string[] {
      return [`Audio transition sequence (performance ms; snapshots of English element; retained ${events.length}/${audioTransitionEventLimit}):`, ...events];
    },
  };
}
