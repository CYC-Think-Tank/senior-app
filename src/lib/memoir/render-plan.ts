function cleanNumber(value: number) {
  return Number(value.toFixed(3));
}

/** Builds one matched video/audio overlap timeline for FFmpeg. */
export function buildMemoirRenderPlan({
  sceneCount,
  sceneDurationSeconds,
  transitionSeconds,
  audioTransitionSeconds,
  width,
  height,
  frameRate,
  includeSceneAudio = true,
}: {
  sceneCount: number;
  sceneDurationSeconds: number;
  transitionSeconds: number;
  audioTransitionSeconds: number;
  width: number;
  height: number;
  frameRate: number;
  includeSceneAudio?: boolean;
}) {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) {
    throw new Error("A memoir render needs at least one scene.");
  }
  if (
    sceneDurationSeconds <= 0 || transitionSeconds < 0
    || audioTransitionSeconds < 0 || frameRate <= 0
  ) {
    throw new Error("Memoir render timing must be positive.");
  }

  const overlap = sceneCount > 1
    ? Math.max(0, Math.min(transitionSeconds, sceneDurationSeconds / 2))
    : 0;
  const preserveCompleteScenes = includeSceneAudio;
  const durationSeconds = cleanNumber(preserveCompleteScenes
    ? sceneCount * sceneDurationSeconds
    : sceneCount * sceneDurationSeconds - (sceneCount - 1) * overlap);
  const videoHandle = preserveCompleteScenes ? overlap : 0;
  const normalizedVideoDuration = cleanNumber(sceneDurationSeconds + videoHandle);
  const videoFilters = Array.from({ length: sceneCount }, (_, index) =>
    `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,settb=AVTB,tpad=stop_mode=clone:stop_duration=${normalizedVideoDuration},trim=duration=${normalizedVideoDuration},setpts=PTS-STARTPTS,format=yuv420p,fps=${frameRate}[v${index}]`,
  );
  const audioHandle = Math.min(audioTransitionSeconds, sceneDurationSeconds / 2);
  const normalizedAudioDuration = cleanNumber(sceneDurationSeconds + audioHandle);
  const audioFilters = includeSceneAudio
    ? Array.from({ length: sceneCount }, (_, index) =>
        `[${index}:a]aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=whole_dur=${normalizedAudioDuration},atrim=duration=${normalizedAudioDuration},asetpts=PTS-STARTPTS[a${index}]`,
      )
    : [];

  const transitionFilters: string[] = [];
  let videoLabel = "v0";
  let audioLabel: string | null = includeSceneAudio ? "a0" : null;
  for (let index = 1; index < sceneCount; index++) {
    const nextVideoLabel = `vx${index}`;
    const offset = cleanNumber(index * (preserveCompleteScenes
      ? sceneDurationSeconds
      : sceneDurationSeconds - overlap));
    transitionFilters.push(
      `[${videoLabel}][v${index}]xfade=transition=fade:duration=${overlap}:offset=${offset}[${nextVideoLabel}]`,
    );
    if (audioLabel) {
      const nextAudioLabel = `ax${index}`;
      transitionFilters.push(
        `[${audioLabel}][a${index}]acrossfade=d=${audioHandle}:c1=tri:c2=tri[${nextAudioLabel}]`,
      );
      audioLabel = nextAudioLabel;
    }
    videoLabel = nextVideoLabel;
  }

  // xfade can negotiate a 4:4:4 working format even when every source is
  // yuv420p. Convert its final output back to the widely supported browser
  // format instead of relying on encoder negotiation.
  const outputVideoLabel = "videoout";
  transitionFilters.push(`[${videoLabel}]format=yuv420p[${outputVideoLabel}]`);

  return {
    filter: [...videoFilters, ...audioFilters, ...transitionFilters].join(";"),
    videoLabel: outputVideoLabel,
    audioLabel,
    durationSeconds,
  };
}
