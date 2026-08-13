function cleanNumber(value: number) {
  return Number(value.toFixed(3));
}

/** Reads the duration of the uncompressed WAV returned by the Speech API. */
export function wavDurationSeconds(buffer: Buffer) {
  if (
    buffer.length < 44 ||
    buffer.toString("ascii", 0, 4) !== "RIFF" ||
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error("The narration service returned an invalid WAV file.");
  }

  let byteRate = 0;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const available = buffer.length - dataOffset;
    if (id === "fmt " && size >= 16 && size <= available) {
      byteRate = buffer.readUInt32LE(dataOffset + 8);
    }
    if (id === "data") {
      // Streaming WAV responses use 0xffffffff until the stream closes. The
      // SDK has already collected the complete response, so the bytes actually
      // present after the data header are authoritative in that case.
      dataBytes += size === 0xffffffff ? available : Math.min(size, available);
    }
    if (size > available) break;
    offset = dataOffset + size + (size % 2);
  }
  if (!byteRate || !dataBytes) {
    throw new Error("The narration WAV file has no readable audio data.");
  }
  return cleanNumber(dataBytes / byteRate);
}

export type NarrationTimelineSegment = {
  delaySeconds: number;
  sourceDurationSeconds: number;
  effectiveDurationSeconds: number;
  tempo: number;
};

/**
 * Places one complete spoken sentence inside each scene's stable visual area.
 * Only sentence-sized silence can meet a transition; a word is never trimmed,
 * faded, crossfaded, or tied to a generated video clip.
 */
export function buildNarrationTimeline({
  segmentDurationsSeconds,
  sceneDurationSeconds,
  transitionSeconds,
  maxTempo = 1.35,
}: {
  segmentDurationsSeconds: number[];
  sceneDurationSeconds: number;
  transitionSeconds: number;
  maxTempo?: number;
}) {
  if (!segmentDurationsSeconds.length) {
    throw new Error("A memoir narration needs at least one spoken segment.");
  }
  if (sceneDurationSeconds <= 0 || transitionSeconds < 0 || maxTempo < 1) {
    throw new Error("Memoir narration timing must be positive.");
  }
  if (segmentDurationsSeconds.some((duration) => !Number.isFinite(duration) || duration <= 0)) {
    throw new Error("Every memoir narration segment needs a valid duration.");
  }

  const sceneCount = segmentDurationsSeconds.length;
  const overlap = sceneCount > 1
    ? Math.max(0, Math.min(transitionSeconds, sceneDurationSeconds / 2))
    : 0;
  const sceneStep = sceneDurationSeconds - overlap;
  const durationSeconds = cleanNumber(
    sceneCount * sceneDurationSeconds - (sceneCount - 1) * overlap,
  );
  const safeWindowSeconds = cleanNumber(sceneDurationSeconds - 2 * overlap);
  if (safeWindowSeconds <= 0) {
    throw new Error("The visual transition leaves no safe narration window.");
  }

  const segments = segmentDurationsSeconds.map((sourceDurationSeconds, index) => {
    const requiredTempo = sourceDurationSeconds / safeWindowSeconds;
    if (requiredTempo > maxTempo) {
      throw new Error(
        `Narration sentence ${index + 1} is too long for its matching visual scene.`,
      );
    }
    // Round upward, never to nearest: rounding down could leave a final few
    // milliseconds outside the safe scene window and clip the last phoneme.
    const tempo = Math.max(1, Math.ceil(requiredTempo * 1000) / 1000);
    const effectiveDurationSeconds = cleanNumber(sourceDurationSeconds / tempo);
    const stableSceneStart = index * sceneStep + overlap;
    const delaySeconds = cleanNumber(
      stableSceneStart + Math.max(0, safeWindowSeconds - effectiveDurationSeconds) / 2,
    );
    return {
      delaySeconds,
      sourceDurationSeconds: cleanNumber(sourceDurationSeconds),
      effectiveDurationSeconds,
      tempo,
    };
  });

  return {
    durationSeconds,
    overlapSeconds: cleanNumber(overlap),
    safeWindowSeconds,
    sceneStepSeconds: cleanNumber(sceneStep),
    segments,
  };
}
