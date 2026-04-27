import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
} from "react-native-track-player";

import { playbackService } from "./service";

let registered = false;

export function registerPlayerService(): void {
  if (registered) return;
  registered = true;
  TrackPlayer.registerPlaybackService(() => playbackService);
}

export async function setupPlayer(): Promise<void> {
  try {
    await TrackPlayer.setupPlayer({
      autoHandleInterruptions: true,
    });
  } catch (err) {
    if ((err as Error).message?.includes("already been initialized")) {
      return;
    }
    throw err;
  }

  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior:
        AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SeekTo,
      Capability.SkipToNext,
      Capability.SkipToPrevious,
      Capability.JumpForward,
      Capability.JumpBackward,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause, Capability.SeekTo],
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SeekTo,
      Capability.JumpForward,
      Capability.JumpBackward,
    ],
    forwardJumpInterval: 15,
    backwardJumpInterval: 15,
    progressUpdateEventInterval: 2,
  });

  await TrackPlayer.setRepeatMode(RepeatMode.Off);
}
