package org.onum.player;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.AudioFormat;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.ShortBuffer;

/**
 * 편집곡을 진짜 음악 파일(.m4a, AAC 192kbps, 44.1kHz 스테레오)로 만든다.
 * 구간마다 필요한 부분만 풀어(디코드) 이어 붙이고, 구간 경계에는 10ms 페이드를 넣어 '딱' 소리를 막는다.
 * 통째로 메모리에 올리지 않고 흘려 보내며(스트리밍) 인코딩한다.
 */
class Exporter {
    static final int SR = 44100, CH = 2;
    private static final int FADE = SR / 100; // 10ms

    interface Progress { void on(double f); }
    static class Clip { String path; double s, e; Clip(String p, double s, double e) { path = p; this.s = s; this.e = e; } }

    private final MediaCodec enc;
    private final MediaMuxer mux;
    private final MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
    private int track = -1;
    private boolean muxing = false;
    private long written = 0; // 인코더에 넣은 프레임 수
    private final short[] pend = new short[8192 * CH];
    private int pendN = 0;

    private Exporter(File out) throws Exception {
        MediaFormat f = MediaFormat.createAudioFormat(MediaFormat.MIMETYPE_AUDIO_AAC, SR, CH);
        f.setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC);
        f.setInteger(MediaFormat.KEY_BIT_RATE, 192_000);
        f.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16384);
        enc = MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC);
        enc.configure(f, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
        enc.start();
        mux = new MediaMuxer(out.getAbsolutePath(), MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
    }

    /** 스테레오 PCM 한 프레임을 모아 두었다가 인코더에 넘긴다 */
    private void put(float l, float r) {
        pend[pendN++] = toShort(l);
        pend[pendN++] = toShort(r);
        if (pendN == pend.length) flush(false);
    }

    private static short toShort(float v) {
        float c = Math.max(-1f, Math.min(1f, v));
        return (short) Math.round(c * 32767f);
    }

    private void flush(boolean eos) {
        int off = 0;
        while (off < pendN || eos) {
            int ii = enc.dequeueInputBuffer(10_000);
            if (ii >= 0) {
                ByteBuffer ib = enc.getInputBuffer(ii);
                if (ib == null) { enc.queueInputBuffer(ii, 0, 0, 0, 0); continue; }
                ib.clear();
                int room = ib.remaining() / 2;
                int n = Math.min(room - room % CH, pendN - off);
                ib.order(ByteOrder.nativeOrder()).asShortBuffer().put(pend, off, n);
                long pts = written * 1_000_000L / SR;
                off += n;
                written += n / CH;
                boolean last = eos && off >= pendN;
                enc.queueInputBuffer(ii, 0, n * 2, pts, last ? MediaCodec.BUFFER_FLAG_END_OF_STREAM : 0);
                if (last) { pendN = 0; drain(true); return; }
            }
            drain(false);
        }
        pendN = 0;
    }

    private void drain(boolean untilEos) {
        int guard = 0;
        while (guard++ < 100_000) {
            int oi = enc.dequeueOutputBuffer(info, untilEos ? 10_000 : 0);
            if (oi == MediaCodec.INFO_TRY_AGAIN_LATER) { if (!untilEos) return; continue; }
            if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                track = mux.addTrack(enc.getOutputFormat());
                mux.start();
                muxing = true;
                continue;
            }
            if (oi < 0) continue;
            ByteBuffer ob = enc.getOutputBuffer(oi);
            boolean cfg = (info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0;
            if (ob != null && info.size > 0 && !cfg && muxing) {
                ob.position(info.offset);
                ob.limit(info.offset + info.size);
                mux.writeSampleData(track, ob, info);
            }
            enc.releaseOutputBuffer(oi, false);
            if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) return;
        }
    }

    private void finish() {
        flush(true);
        try { enc.stop(); } catch (Exception ignored) {}
        enc.release();
        if (muxing) mux.stop();
        mux.release();
    }

    /** 한 구간: s초부터 e초까지 풀어 44.1kHz 스테레오로 바꿔(선형 보간) 넣는다 */
    private void part(Clip c, Progress pr, double doneSec, double totalSec) throws Exception {
        MediaExtractor ex = new MediaExtractor();
        ex.setDataSource(c.path);
        MediaFormat fmt = null;
        for (int i = 0; i < ex.getTrackCount(); i++) {
            MediaFormat f = ex.getTrackFormat(i);
            String m = f.getString(MediaFormat.KEY_MIME);
            if (m != null && m.startsWith("audio/")) { ex.selectTrack(i); fmt = f; break; }
        }
        if (fmt == null) { ex.release(); throw new Exception("no_audio"); }
        int fs = fmt.getInteger(MediaFormat.KEY_SAMPLE_RATE);
        int ch = fmt.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
        boolean isFloat = false;
        MediaCodec dec = MediaCodec.createDecoderByType(fmt.getString(MediaFormat.KEY_MIME));
        dec.configure(fmt, null, null, 0);
        dec.start();
        long sUs = (long) (c.s * 1_000_000), eUs = (long) (c.e * 1_000_000);
        ex.seekTo(sUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC);

        long outTotal = Math.max(1, Math.round((c.e - c.s) * SR));
        long outN = 0;
        double t = 0;          // 다음에 만들 출력 표본의 자리(원본 프레임 단위, 구간 시작부터)
        long base = 0;         // 이번 덩어리 첫 프레임의 자리
        float pl = 0, pr2 = 0; // 앞 덩어리 마지막 프레임
        boolean havePrev = false;
        boolean inEos = false, outEos = false, past = false;
        int guard = 0;
        MediaCodec.BufferInfo di = new MediaCodec.BufferInfo();
        while (!outEos && !past && guard++ < 2_000_000 && outN < outTotal) {
            if (!inEos) {
                int ii = dec.dequeueInputBuffer(10_000);
                if (ii >= 0) {
                    ByteBuffer ib = dec.getInputBuffer(ii);
                    int n = ib == null ? -1 : ex.readSampleData(ib, 0);
                    if (n < 0 || ex.getSampleTime() > eUs + 500_000) {
                        dec.queueInputBuffer(ii, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                        inEos = true;
                    } else {
                        dec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0);
                        ex.advance();
                    }
                }
            }
            int oi = dec.dequeueOutputBuffer(di, 10_000);
            if (oi == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                MediaFormat of = dec.getOutputFormat();
                if (of.containsKey(MediaFormat.KEY_SAMPLE_RATE)) fs = of.getInteger(MediaFormat.KEY_SAMPLE_RATE);
                if (of.containsKey(MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(MediaFormat.KEY_CHANNEL_COUNT);
                if (of.containsKey(MediaFormat.KEY_PCM_ENCODING))
                    isFloat = of.getInteger(MediaFormat.KEY_PCM_ENCODING) == AudioFormat.ENCODING_PCM_FLOAT;
                continue;
            }
            if (oi < 0) continue;
            ByteBuffer ob = dec.getOutputBuffer(oi);
            if (ob != null && di.size > 0) {
                ob.position(di.offset);
                ob.limit(di.offset + di.size);
                ByteBuffer o2 = ob.slice().order(ByteOrder.nativeOrder());
                int samples = isFloat ? di.size / 4 : di.size / 2;
                int frames = samples / Math.max(1, ch);
                // 이 덩어리에서 구간 안에 드는 프레임만
                long ptsUs = di.presentationTimeUs;
                int from = (int) Math.max(0, Math.ceil((sUs - ptsUs) * (double) fs / 1_000_000));
                int to = (int) Math.min(frames, Math.floor((eUs - ptsUs) * (double) fs / 1_000_000));
                if (ptsUs >= eUs) past = true;
                if (to > from) {
                    float[] L = new float[to - from], R = new float[to - from];
                    FloatBuffer fb = isFloat ? o2.asFloatBuffer() : null;
                    ShortBuffer sb = isFloat ? null : o2.asShortBuffer();
                    for (int k = from; k < to; k++) {
                        int b = k * ch;
                        float l = isFloat ? fb.get(b) : sb.get(b) / 32768f;
                        float r = ch > 1 ? (isFloat ? fb.get(b + 1) : sb.get(b + 1) / 32768f) : l;
                        L[k - from] = l;
                        R[k - from] = r;
                    }
                    int m = L.length;
                    double ratio = fs / (double) SR;
                    while (outN < outTotal) {
                        long i0 = (long) Math.floor(t);
                        if (i0 + 1 >= base + m) break;
                        double f = t - i0;
                        float l0, r0;
                        if (i0 < base) { if (!havePrev) { t += ratio; continue; } l0 = pl; r0 = pr2; }
                        else { l0 = L[(int) (i0 - base)]; r0 = R[(int) (i0 - base)]; }
                        float l1 = L[(int) (i0 + 1 - base)], r1 = R[(int) (i0 + 1 - base)];
                        float gain = 1f;
                        if (outN < FADE) gain = outN / (float) FADE;
                        long left = outTotal - outN;
                        if (left < FADE) gain = Math.min(gain, left / (float) FADE);
                        put((float) (l0 + (l1 - l0) * f) * gain, (float) (r0 + (r1 - r0) * f) * gain);
                        outN++;
                        t += ratio;
                    }
                    pl = L[m - 1]; pr2 = R[m - 1]; havePrev = true;
                    base += m;
                    if (pr != null && (outN & 0x3fff) < 2048) pr.on(Math.min(1, (doneSec + outN / (double) SR) / Math.max(0.001, totalSec)));
                }
            }
            dec.releaseOutputBuffer(oi, false);
            if ((di.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEos = true;
        }
        try { dec.stop(); } catch (Exception ignored) {}
        dec.release();
        ex.release();
    }

    /** 편집곡을 파일로 만들어 「음악/온음」에 넣는다. 돌려주는 값: 저장된 자리(사용자에게 보여 줄 말) */
    static String run(Context ctx, Clip[] clips, String name, Progress pr) throws Exception {
        File tmp = new File(ctx.getCacheDir(), "onum-export.m4a");
        if (tmp.exists()) tmp.delete();
        double total = 0;
        for (Clip c : clips) total += Math.max(0, c.e - c.s);
        Exporter x = new Exporter(tmp);
        double done = 0;
        try {
            for (Clip c : clips) {
                x.part(c, pr, done, total);
                done += Math.max(0, c.e - c.s);
            }
        } finally {
            x.finish();
        }
        String safe = name.replaceAll("[\\\\/:*?\"<>|]", " ").trim();
        if (safe.isEmpty()) safe = "온음 편집곡";
        String file = safe + ".m4a";
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = ctx.getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.Audio.Media.DISPLAY_NAME, file);
            v.put(MediaStore.Audio.Media.TITLE, safe);
            v.put(MediaStore.Audio.Media.MIME_TYPE, "audio/mp4");
            v.put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/온음");
            v.put(MediaStore.Audio.Media.IS_MUSIC, 1);
            v.put(MediaStore.Audio.Media.IS_PENDING, 1);
            Uri uri = cr.insert(MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
            if (uri == null) throw new Exception("save_failed");
            try (OutputStream os = cr.openOutputStream(uri); InputStream is = new FileInputStream(tmp)) {
                if (os == null) throw new Exception("save_failed");
                byte[] buf = new byte[65536];
                int n;
                while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
            }
            v.clear();
            v.put(MediaStore.Audio.Media.IS_PENDING, 0);
            cr.update(uri, v, null, null);
            tmp.delete();
            return "음악/온음/" + file;
        }
        // 안드로이드 9 이하: 앱 전용 음악 폴더에 둔다(저장 권한 없이 쓸 수 있는 곳)
        File dir = ctx.getExternalFilesDir(Environment.DIRECTORY_MUSIC);
        if (dir == null) throw new Exception("save_failed");
        File out = new File(dir, file);
        try (InputStream is = new FileInputStream(tmp); OutputStream os = new FileOutputStream(out)) {
            byte[] buf = new byte[65536];
            int n;
            while ((n = is.read(buf)) > 0) os.write(buf, 0, n);
        }
        tmp.delete();
        MediaScannerConnection.scanFile(ctx, new String[]{out.getAbsolutePath()}, null, null);
        return out.getAbsolutePath();
    }
}
