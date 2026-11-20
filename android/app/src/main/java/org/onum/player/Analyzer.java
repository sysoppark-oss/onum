package org.onum.player;

import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.ShortBuffer;
import java.util.Arrays;

/**
 * 곡 한 개를 휴대폰이 직접 잰다. 통째로 풀지 않고 필요한 조각만 푼다.
 * - 소리 모양: bars 구간마다 가운데 1초의 크기(rms)
 * - 소리 크기: 그 조각들로 BS.1770 통합 크기(LUFS)
 * - 앞뒤 무음: 처음 15초, 마지막 20초를 풀어 -55 dBFS보다 큰 소리가 처음·마지막으로 나는 때
 */
class Analyzer implements AutoCloseable {
    private static final double QUIET = Math.pow(10, -55 / 20.0);
    private final MediaExtractor ex = new MediaExtractor();
    private MediaCodec codec;
    private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
    int fs, ch;
    long durUs;
    private boolean isFloat = false;

    Analyzer(String path) throws Exception {
        ex.setDataSource(path);
        MediaFormat fmt = null;
        for (int i = 0; i < ex.getTrackCount(); i++) {
            MediaFormat f = ex.getTrackFormat(i);
            String m = f.getString(MediaFormat.KEY_MIME);
            if (m != null && m.startsWith("audio/")) { ex.selectTrack(i); fmt = f; break; }
        }
        if (fmt == null) throw new Exception("no_audio");
        durUs = fmt.containsKey(MediaFormat.KEY_DURATION) ? fmt.getLong(MediaFormat.KEY_DURATION) : 0;
        if (durUs <= 0) throw new Exception("no_duration");
        fs = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE);
        ch = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        codec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
        codec.configure(fmt, null, null, 0);
        codec.start();
    }

    /** atUs부터 lenUs만큼 풀어 채널이 섞인(interleaved) 표본을 돌려준다. fs·ch는 실제 출력 형식으로 맞춰진다. */
    float[] decode(long atUs, long lenUs) {
        ex.seekTo(Math.max(0, atUs), MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
        codec.flush();
        float[] buf = new float[0];
        int got = 0;
        boolean inEos = false, outEos = false;
        int guard = 0;
        while (!outEos && guard++ < 4000) {
            long cap = (long) fs * ch * lenUs / 1_000_000L;
            if (cap > 0 && got >= cap) break;
            if (!inEos) {
                int ii = codec.dequeueInputBuffer(10_000);
                if (ii >= 0) {
                    ByteBuffer ib = codec.getInputBuffer(ii);
                    int n = ib == null ? -1 : ex.readSampleData(ib, 0);
                    if (n < 0) {
                        codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                        inEos = true;
                    } else {
                        codec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0);
                        ex.advance();
                    }
                }
            }
            int oi = codec.dequeueOutputBuffer(info, 10_000);
            if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                MediaFormat of = codec.getOutputFormat();
                if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) fs = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                if (of.containsKey(MediaFormat.KEY_PCM_ENCODING))
                    isFloat = of.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT;
            } else if (oi >= 0) {
                ByteBuffer ob = codec.getOutputBuffer(oi);
                if (ob != null && info.size > 0 && info.presentationTimeUs >= atUs - 50_000) {
                    ob.position(info.offset);
                    ob.limit(info.offset + info.size);
                    ByteBuffer o2 = ob.slice().order(ByteOrder.nativeOrder());
                    int n = isFloat ? info.size / 4 : info.size / 2;
                    if (got + n > buf.length) buf = Arrays.copyOf(buf, Math.max(got + n, buf.length * 2));
                    if (isFloat) { FloatBuffer fb = o2.asFloatBuffer(); for (int k = 0; k < n; k++) buf[got++] = fb.get(k); }
                    else { ShortBuffer sb = o2.asShortBuffer(); for (int k = 0; k < n; k++) buf[got++] = sb.get(k) / 32768f; }
                }
                codec.releaseOutputBuffer(oi, false);
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEos = true;
            }
        }
        return Arrays.copyOf(buf, got);
    }

    /** 처음부터 끝까지 풀어 한 줄(모노) outRate Hz 소리로. maxSec 넘는 곡은 앞부분만 */
    float[] mono(int outRate, int maxSec) {
        ex.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
        codec.flush();
        long secs = Math.min(maxSec, Math.max(1, durUs / 1_000_000 + 2));
        float[] out = new float[(int) (secs * outRate) + outRate];
        int nOut = 0;
        double pos = 0; // 다음 출력 칸이 놓일 입력 자리
        long inIdx = 0;
        float prev = 0;
        boolean inEos = false, outEos = false;
        long idle = 0;
        while (!outEos && idle < 400 && nOut < out.length) {
            if (!inEos) {
                int ii = codec.dequeueInputBuffer(10_000);
                if (ii >= 0) {
                    ByteBuffer ib = codec.getInputBuffer(ii);
                    int n = ib == null ? -1 : ex.readSampleData(ib, 0);
                    if (n < 0) { codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inEos = true; }
                    else { codec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0); ex.advance(); }
                }
            }
            int oi = codec.dequeueOutputBuffer(info, 10_000);
            if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                MediaFormat of = codec.getOutputFormat();
                if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) fs = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                if (of.containsKey(MediaFormat.KEY_PCM_ENCODING))
                    isFloat = of.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT;
            } else if (oi >= 0) {
                idle = 0;
                ByteBuffer ob = codec.getOutputBuffer(oi);
                if (ob != null && info.size > 0) {
                    ob.position(info.offset);
                    ob.limit(info.offset + info.size);
                    ByteBuffer o2 = ob.slice().order(ByteOrder.nativeOrder());
                    int c = Math.max(1, ch);
                    int n = (isFloat ? info.size / 4 : info.size / 2) / c;
                    FloatBuffer fb = isFloat ? o2.asFloatBuffer() : null;
                    ShortBuffer sb = isFloat ? null : o2.asShortBuffer();
                    double ratio = (double) Math.max(1, fs) / outRate; // 출력 한 칸이 입력 몇 칸인지
                    for (int f = 0; f < n && nOut < out.length; f++) {
                        float m = 0;
                        for (int k = 0; k < c; k++) m += isFloat ? fb.get(f * c + k) : sb.get(f * c + k) / 32768f;
                        m /= c;
                        // 입력 칸 inIdx-1 과 inIdx 사이에 놓이는 출력 칸들을 선으로 이어 채운다
                        while (pos <= inIdx && nOut < out.length) {
                            double frac = inIdx == 0 ? 1 : pos - (inIdx - 1);
                            out[nOut++] = (float) (prev + (m - prev) * frac);
                            pos += ratio;
                        }
                        prev = m;
                        inIdx++;
                    }
                }
                codec.releaseOutputBuffer(oi, false);
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEos = true;
            } else idle++;
        }
        return Arrays.copyOf(out, nOut);
    }

    /** 처음부터 끝까지 흘려 풀며 winMs 창마다 크기(dBFS)를 잰다. 표본은 쌓지 않는다(긴 강의도 메모리 걱정 없음). */
    float[] levels(int winMs) {
        ex.seekTo(0, MediaExtractor.SEEK_TO_CLOSEST_SYNC);
        codec.flush();
        int cap = (int) (durUs / 1000 / winMs) + 64;
        float[] out = new float[cap];
        int nOut = 0;
        double acc = 0;
        long accN = 0;
        long winFrames = -1;
        int pos = 0; // 창 안에서 센 프레임
        boolean inEos = false, outEos = false;
        long idle = 0;
        while (!outEos && idle < 400) {
            if (!inEos) {
                int ii = codec.dequeueInputBuffer(10_000);
                if (ii >= 0) {
                    ByteBuffer ib = codec.getInputBuffer(ii);
                    int n = ib == null ? -1 : ex.readSampleData(ib, 0);
                    if (n < 0) { codec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM); inEos = true; }
                    else { codec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0); ex.advance(); }
                }
            }
            int oi = codec.dequeueOutputBuffer(info, 10_000);
            if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                MediaFormat of = codec.getOutputFormat();
                if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) fs = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                if (of.containsKey(MediaFormat.KEY_PCM_ENCODING))
                    isFloat = of.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT;
                winFrames = -1;
            } else if (oi >= 0) {
                idle = 0;
                if (winFrames < 0) winFrames = Math.max(1, (long) fs * winMs / 1000);
                ByteBuffer ob = codec.getOutputBuffer(oi);
                if (ob != null && info.size > 0) {
                    ob.position(info.offset);
                    ob.limit(info.offset + info.size);
                    ByteBuffer o2 = ob.slice().order(ByteOrder.nativeOrder());
                    int c = Math.max(1, ch);
                    int n = (isFloat ? info.size / 4 : info.size / 2) / c;
                    FloatBuffer fb = isFloat ? o2.asFloatBuffer() : null;
                    ShortBuffer sb = isFloat ? null : o2.asShortBuffer();
                    for (int f = 0; f < n; f++) {
                        double m = 0;
                        for (int k = 0; k < c; k++) m += isFloat ? fb.get(f * c + k) : sb.get(f * c + k) / 32768.0;
                        m /= c;
                        acc += m * m; accN++;
                        if (++pos >= winFrames) {
                            if (nOut >= out.length) out = Arrays.copyOf(out, out.length * 2);
                            out[nOut++] = (float) (10 * Math.log10(acc / accN + 1e-12));
                            acc = 0; accN = 0; pos = 0;
                        }
                    }
                }
                codec.releaseOutputBuffer(oi, false);
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEos = true;
            } else idle++;
        }
        return Arrays.copyOf(out, nOut);
    }

    /** 50ms 창마다 크기. 조용한 기준보다 큰 창의 번호(처음 또는 마지막). 없으면 -1 */
    int loudWindow(float[] buf, boolean first) {
        int win = Math.max(1, fs / 20) * ch;
        int n = buf.length / win;
        for (int w0 = 0; w0 < n; w0++) {
            int w = first ? w0 : n - 1 - w0;
            double s = 0;
            for (int i = w * win; i < (w + 1) * win; i++) s += buf[i] * buf[i];
            if (Math.sqrt(s / win) > QUIET) return w;
        }
        return -1;
    }

    @Override
    public void close() {
        if (codec != null) {
            try { codec.stop(); } catch (Exception ignored) {}
            try { codec.release(); } catch (Exception ignored) {}
        }
        ex.release();
    }
}
