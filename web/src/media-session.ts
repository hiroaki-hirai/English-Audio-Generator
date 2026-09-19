export type TrainingRuntimeKind = 'none' | 'active-recall' | 'training';

export type AudioPlayOwner =
  | 'none'
  | 'active-recall'
  | 'training'
  | 'phrase-tap'
  | 'lesson-player'
  | 'media-session';

export type MediaSessionAction = 'play' | 'pause';

export type MediaSessionPolicyState = {
  runtimeActive: boolean;
  runtimeKind: TrainingRuntimeKind;
  audioPlayOwner: AudioPlayOwner;
  expectedPhraseEnd: number | null;
};

export type MediaSessionActionControls = {
  play: () => void;
  pause: () => void;
};

export type IdlePlaybackContext = {
  audioPlayOwner: 'none';
  expectedPhraseEnd: null;
  pendingPlayTrigger: null;
};

export function isMediaSessionActionAllowed(
  state: MediaSessionPolicyState,
  _action: MediaSessionAction,
): boolean {
  if (!state.runtimeActive) {
    return (
      state.runtimeKind === 'none' &&
      (state.audioPlayOwner === 'phrase-tap' ||
        state.audioPlayOwner === 'lesson-player')
    );
  }

  if (state.runtimeKind === 'active-recall') {
    return (
      state.audioPlayOwner === 'active-recall' &&
      state.expectedPhraseEnd !== null
    );
  }

  return (
    state.runtimeKind === 'training' &&
    state.audioPlayOwner === 'training'
  );
}

export function dispatchMediaSessionAction(
  state: MediaSessionPolicyState,
  action: MediaSessionAction,
  controls: MediaSessionActionControls,
): boolean {
  if (!isMediaSessionActionAllowed(state, action)) {
    return false;
  }

  if (action === 'play') {
    controls.play();
  } else {
    controls.pause();
  }

  return true;
}

export function createIdlePlaybackContext(): IdlePlaybackContext {
  return {
    audioPlayOwner: 'none',
    expectedPhraseEnd: null,
    pendingPlayTrigger: null,
  };
}
