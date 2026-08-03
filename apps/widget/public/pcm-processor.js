/**
 * PCM Processor — AudioWorklet for Phase 3 Realtime Voice
 *
 * Captures microphone audio at whatever sample rate the AudioContext runs at
 * (we create the context at 24000 Hz so the browser handles resampling),
 * converts Float32 samples to Int16 PCM, and posts them to the main thread.
 */
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;

    const int16 = new Int16Array(channel.length);
    for (let i = 0; i < channel.length; i++) {
      const s = Math.max(-1, Math.min(1, channel[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    // Transfer the buffer to avoid copying
    this.port.postMessage(int16, [int16.buffer]);
    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
