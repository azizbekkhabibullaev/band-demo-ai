/**
 * RealtimeAudioPlayer — proper PCM16 streaming player for OpenAI Realtime audio.
 *
 * Scheduling rule: NEVER start every chunk at audioContext.currentTime.
 * Each chunk is queued at `nextPlayTime` so chunks play back-to-back
 * without overlap or gap. `nextPlayTime` advances with each chunk.
 *
 * Done detection: when the server signals all chunks have been sent
 * (markServerDone), we compute:
 *   remaining = nextPlayTime - ctx.currentTime   (seconds still to play)
 * and fire a timer for that duration + 300ms hardware safety tail.
 * This is exact — no onended event races, no source-tracking complexity.
 *
 * Audio stops only on:
 *   flush()  — barge-in or explicit interrupt (with 100ms fade)
 *   stop()   — call ended (immediate)
 * Never on response.done, response.created, or any other lifecycle event.
 */

export class RealtimeAudioPlayer {
  private readonly ctx: AudioContext;
  private readonly masterGain: GainNode;
  private nextPlayTime = 0;
  private activeSources: AudioBufferSourceNode[] = [];
  private doneTimer: ReturnType<typeof setTimeout> | null = null;
  private chunkCount = 0;
  private totalScheduledMs = 0;
  private readonly onAmplitude: (v: number) => void;
  private readonly onDone: (responseId: string) => void;

  constructor(
    sampleRate: number,
    onAmplitude: (v: number) => void,
    onDone: (responseId: string) => void,
  ) {
    this.ctx = new AudioContext({ sampleRate });
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
    this.onAmplitude = onAmplitude;
    this.onDone = onDone;
  }

  enqueue(pcm16: ArrayBuffer): void {
    const int16  = new Int16Array(pcm16);
    const f32    = new Float32Array(int16.length);
    let sumSq = 0;
    for (let i = 0; i < int16.length; i++) {
      const v = (int16[i] ?? 0) / 32768;
      f32[i] = v;
      sumSq += v * v;
    }
    this.onAmplitude(Math.min(1, Math.sqrt(sumSq / int16.length) * 8));

    const buffer = this.ctx.createBuffer(1, f32.length, this.ctx.sampleRate);
    buffer.copyToChannel(f32, 0);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.masterGain);

    // Schedule contiguously — never start at currentTime for every chunk.
    const startTime = Math.max(this.ctx.currentTime, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;

    const chunkMs = Math.round(buffer.duration * 1000);
    this.chunkCount++;
    this.totalScheduledMs += chunkMs;
    if (this.chunkCount === 1) {
      console.log(`[PLAYER] first chunk — ${chunkMs}ms, startTime=${startTime.toFixed(3)}s, ctxTime=${this.ctx.currentTime.toFixed(3)}s`);
    }

    this.activeSources.push(source);
    source.onended = () => {
      this.activeSources = this.activeSources.filter(s => s !== source);
    };
  }

  /**
   * Called when the server has finished sending all audio chunks.
   * Schedules onDone to fire after the last sample plays.
   */
  markServerDone(responseId = 'unknown'): void {
    const remainingMs = Math.max(0, (this.nextPlayTime - this.ctx.currentTime) * 1000);
    const tailMs = remainingMs + 300;
    console.log(
      `[CORR][${responseId}] markServerDone` +
      ` chunks=${this.chunkCount} total=${Math.round(this.totalScheduledMs)}ms` +
      ` remaining=${Math.round(remainingMs)}ms onDone_in=${Math.round(tailMs)}ms` +
      ` nextPlayTime=${this.nextPlayTime.toFixed(3)}s ctxTime=${this.ctx.currentTime.toFixed(3)}s`
    );
    // Reset counters for next response
    this.chunkCount = 0;
    this.totalScheduledMs = 0;
    if (this.doneTimer) clearTimeout(this.doneTimer);
    this.doneTimer = setTimeout(() => {
      // ── CompletionValidator ──────────────────────────────────────────────────
      // Verify the AudioContext has actually advanced past nextPlayTime.
      // If the tab was backgrounded, currentTime freezes while the timer still
      // fires — audio hasn't played yet. Reschedule for the remaining duration.
      const overrunMs = Math.round((this.nextPlayTime - this.ctx.currentTime) * 1000);
      if (overrunMs > 50) {
        console.log(`[CORR][${responseId}] CompletionValidator: RESCHEDULE — ctx paused, ${overrunMs}ms still queued`);
        this.markServerDone(responseId);
        return;
      }
      this.doneTimer = null;
      this.activeSources = [];
      this.onAmplitude(0);
      console.log(`[CORR][${responseId}] onDone — CompletionValidator PASS (overrun=${overrunMs}ms) — signalling backend`);
      this.onDone(responseId);
    }, tailMs);
  }

  /**
   * Barge-in / explicit interrupt — fade out and stop all scheduled audio.
   * Cancels any pending done timer so a false playback_complete is never sent.
   */
  flush(fadeMs = 100): void {
    if (this.doneTimer) { clearTimeout(this.doneTimer); this.doneTimer = null; }

    const now     = this.ctx.currentTime;
    const fadeSec = fadeMs / 1000;

    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
    this.masterGain.gain.linearRampToValueAtTime(0, now + fadeSec);

    for (const src of this.activeSources) {
      try { src.stop(now + fadeSec); } catch { /* already stopped */ }
    }
    this.activeSources = [];
    this.nextPlayTime  = 0;
    this.chunkCount    = 0;
    this.totalScheduledMs = 0;
    this.onAmplitude(0);

    // Restore gain so the next response plays at full volume.
    const gain = this.masterGain;
    const ctx  = this.ctx;
    setTimeout(() => {
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(1, ctx.currentTime);
    }, fadeMs + 50);
  }

  /** Call end — immediate silence, close AudioContext. */
  stop(): void {
    if (this.doneTimer) { clearTimeout(this.doneTimer); this.doneTimer = null; }
    const now = this.ctx.currentTime;
    for (const src of this.activeSources) {
      try { src.stop(now); } catch { /* already stopped */ }
    }
    this.activeSources = [];
    this.nextPlayTime  = 0;
    void this.ctx.close();
  }

  get state(): AudioContextState { return this.ctx.state; }
  resume(): Promise<void>        { return this.ctx.resume(); }
}
