let gameAudioContext: AudioContext | null = null;

export const setGameAudioContext = (ctx: AudioContext | null) => {
  gameAudioContext = ctx;
};

export const getGameAudioContext = (): AudioContext | null => gameAudioContext;
