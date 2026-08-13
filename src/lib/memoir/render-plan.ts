function cleanNumber(value: number) {
  return Number(value.toFixed(3));
}

/** Builds one matched video/audio overlap timeline for FFmpeg. */
export function buildMemoirRenderPlan({
  sceneCount,
  sceneDurationSeconds,
  transitionSeconds,
  width,
  height,
  includeSceneAudio = true,
}: {
  sceneCount: number;
  sceneDurationSeconds: number;
  transitionSeconds: number;
  width: number;
  height: number;
  includeSceneAudio?: boolean;
}) {
  if (!Number.isInteger(sceneCount) || sceneCount < 1) {
    throw new Error("A memoir render needs at least one scene.");
  }
  if (sceneDurationSeconds <= 0 || transitionSeconds < 0) {
    throw new Error("Memoir render timing must be positive.");
  }

  const overlap = sceneCount > 1
    ? Math.max(0, Math.min(transitionSeconds, sceneDurationSeconds / 2))
    : 0;
  const durationSeconds = cleanNumber(
    sceneCount * sceneDurationSeconds - (sceneCount - 1) * overlap,
  );
  const videoFilters = Array.from({ length: sceneCount }, (_, index) =>
    `[${index}:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,settb=AVTB,tpad=stop_mode=clone:stop_duration=${sceneDurationSeconds},trim=duration=${sceneDurationSeconds},setpts=PTS-STARTPTS,format=yuv420p[v${index}]`,
  );
  const audioFilters = includeSceneAudio
    ? Array.from({ length: sceneCount }, (_, index) =>
        `[${index}:a]aresample=48000:async=1:first_pts=0,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,apad=pad_dur=${sceneDurationSeconds},atrim=duration=${sceneDurationSeconds},asetpts=PTS-STARTPTS[a${index}]`,
      )
    : [];

  const transitionFilters: string[] = [];
  let videoLabel = "v0";
  let audioLabel: string | null = includeSceneAudio ? "a0" : null;
  for (let index = 1; index < sceneCount; index++) {
    const nextVideoLabel = `vx${index}`;
    const offset = cleanNumber(index * (sceneDurationSeconds - overlap));
    transitionFilters.push(
      `[${videoLabel}][v${index}]xfade=transition=fade:duration=${overlap}:offset=${offset}[${nextVideoLabel}]`,
    );
    if (audioLabel) {
      const nextAudioLabel = `ax${index}`;
      transitionFilters.push(
        `[${audioLabel}][a${index}]acrossfade=d=${overlap}:c1=tri:c2=tri[${nextAudioLabel}]`,
      );
      audioLabel = nextAudioLabel;
    }
    videoLabel = nextVideoLabel;
  }

  return {
    filter: [...videoFilters, ...audioFilters, ...transitionFilters].join(";"),
    videoLabel,
    audioLabel,
    durationSeconds,
  };
}
