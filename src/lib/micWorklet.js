// 노래방 녹음: 마이크 소리를 16비트로 모아 조각마다 넘긴다. 첫 조각에는 녹음이 시작된 AudioContext 시각을 붙인다.
class OnumMic extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buf = new Int16Array(8192)
    this.n = 0
    this.on = true
    this.t0 = -1
    this.port.onmessage = (e) => { if (e.data === 'stop') { this.flush(); this.on = false; this.port.postMessage({ done: true }) } }
  }
  flush() {
    if (!this.n) return
    const out = this.buf.slice(0, this.n)
    this.port.postMessage({ pcm: out }, [out.buffer])
    this.n = 0
  }
  process(inputs) {
    if (!this.on) return false
    const ch = inputs[0] && inputs[0][0]
    if (ch) {
      if (this.t0 < 0) { this.t0 = currentTime; this.port.postMessage({ t0: currentTime, sr: sampleRate }) }
      for (let i = 0; i < ch.length; i++) {
        const v = Math.max(-1, Math.min(1, ch[i]))
        this.buf[this.n++] = v * 32767
        if (this.n === this.buf.length) this.flush()
      }
    }
    return true
  }
}
registerProcessor('onum-mic', OnumMic)
