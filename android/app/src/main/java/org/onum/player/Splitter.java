package org.onum.player;

import android.content.Context;
import android.content.res.AssetFileDescriptor;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.DataInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.FloatBuffer;
import java.util.Collections;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

/**
 * 노래방 AI 반주 만들기: HTDemucs(Meta, MIT)로 곡을 드럼·베이스·기타 소리·목소리로 나눈 뒤
 * 목소리를 뺀 셋을 더해 반주를 만든다. 모든 계산은 휴대폰 안에서만 한다.
 *
 * 모델 입력 mix [1, 2, 343980](44.1kHz 스테레오 7.8초), 출력 stems [1, 4, 2, 343980]
 * (drums, bass, other, vocals). 긴 곡은 1/4씩 겹쳐 잘라 돌리고 삼각 창으로 이어 붙인다.
 * 이어 붙이기는 앞에서부터 차례로 끝내 가므로 곡 전체를 메모리에 올리지 않는다.
 */
class Splitter {
    static final String ASSET = "models/htdemucs.onnx";
    static final int SR = 44100, N = 343980, OV = N / 4, STRIDE = N - OV, VOCALS = 3;
    static volatile boolean cancel = false;

    interface Progress { void on(double f); }

    /** 앱 안에 모델이 들어 있는지(PC 개발 빌드 등에는 없을 수 있다) */
    static boolean hasModel(Context ctx) {
        try (AssetFileDescriptor fd = ctx.getAssets().openFd(ASSET)) { return fd.getLength() > 1_000_000; }
        catch (Exception e) { return false; }
    }

    /** 모델을 앱 파일 자리로 한 번 꺼내 둔다(ONNX Runtime은 파일 경로로 여는 게 메모리를 덜 쓴다) */
    private static File model(Context ctx) throws Exception {
        long len;
        try (AssetFileDescriptor fd = ctx.getAssets().openFd(ASSET)) { len = fd.getLength(); }
        File dir = new File(ctx.getFilesDir(), "ai");
        dir.mkdirs();
        File f = new File(dir, "htdemucs-" + len + ".onnx");
        if (f.exists() && f.length() == len) return f;
        File[] old = dir.listFiles();
        if (old != null) for (File o : old) if (o.getName().endsWith(".onnx")) o.delete();
        File tmp = new File(dir, "model.part");
        try (InputStream in = ctx.getAssets().open(ASSET); OutputStream out = new FileOutputStream(tmp)) {
            byte[] b = new byte[1 << 16];
            int n;
            while ((n = in.read(b)) > 0) out.write(b, 0, n);
        }
        if (!tmp.renameTo(f)) throw new Exception("model_copy_failed");
        return f;
    }

    /** 만든 반주가 들어갈 자리 */
    static File outFile(Context ctx, String id) {
        File dir = new File(ctx.getFilesDir(), "kara-ai");
        dir.mkdirs();
        return new File(dir, id.replaceAll("[^A-Za-z0-9_-]", "_") + ".m4a");
    }

    static File run(Context ctx, String src, double durSec, String id, Progress pr) throws Exception {
        cancel = false;
        File out = outFile(ctx, id);
        File pcm = new File(ctx.getCacheDir(), "ai-mix.pcm");
        File part = new File(out.getParentFile(), out.getName() + ".part");
        long frames;
        // 1) 곡을 44.1kHz 스테레오 16비트로 풀어 둔다
        try (PcmFile w = new PcmFile(new BufferedOutputStream(new FileOutputStream(pcm), 1 << 16))) {
            double end = durSec > 1 ? durSec + 2 : 36000; // 길이를 모르면 끝까지
            Exporter.decode(new Exporter.Clip(src, 0, end), w, false, f -> pr.on(0.04 * f), 0, end);
            frames = w.frames;
        }
        if (frames < SR) { pcm.delete(); throw new Exception("too_short"); }
        if (cancel) { pcm.delete(); throw new Exception("cancelled"); }
        pr.on(0.05);

        OrtEnvironment env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions so = new OrtSession.SessionOptions();
        // 그래프 최적화(상수 접기)를 켜면 모델을 열 때 메모리를 수 GB 쓴다. 끄면 1.3GB 안팎
        so.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.NO_OPT);
        so.setCPUArenaAllocator(false);
        so.setIntraOpNumThreads(Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors())));
        float[] win = new float[N];
        for (int i = 0; i < N; i++) win[i] = 1f;
        for (int i = 0; i < OV; i++) { float v = i / (float) (OV - 1); win[i] = v; win[N - 1 - i] = v; }

        int chunks = (int) Math.max(1, (frames + STRIDE - 1) / STRIDE);
        float[] in = new float[2 * N];
        float[] accL = new float[N], accR = new float[N], wgt = new float[N];
        Exporter enc = new Exporter(part);
        boolean ok = false;
        try (OrtSession sess = env.createSession(model(ctx).getAbsolutePath(), so);
             DataInputStream rd = new DataInputStream(new BufferedInputStream(new FileInputStream(pcm), 1 << 16))) {
            // 첫 덩어리는 처음부터 N개, 다음부터는 겹치는 OV개를 남겨 두고 STRIDE개씩 더 읽는다
            float[] bufL = new float[N], bufR = new float[N];
            int have = 0;
            long readTotal = 0;
            for (int c = 0; c < chunks; c++) {
                if (cancel) throw new Exception("cancelled");
                long start = (long) c * STRIDE;
                int len = (int) Math.min(N, frames - start);
                if (len <= 0) break;
                // 앞 덩어리의 뒷부분(OV)을 앞으로 당긴다
                if (c > 0) {
                    System.arraycopy(bufL, STRIDE, bufL, 0, OV);
                    System.arraycopy(bufR, STRIDE, bufR, 0, OV);
                    have = OV;
                }
                while (have < len && readTotal < frames) {
                    bufL[have] = rd.readShort() / 32768f;
                    bufR[have] = rd.readShort() / 32768f;
                    // DataInputStream은 빅 엔디언이라, 쓸 때 맞춰 두었다(PcmFile 참고)
                    have++;
                    readTotal++;
                }
                boolean last = c == chunks - 1 || start + len >= frames;
                for (int i = 0; i < N; i++) {
                    in[i] = i < len ? bufL[i] : 0f;
                    in[N + i] = i < len ? bufR[i] : 0f;
                }
                try (OnnxTensor x = OnnxTensor.createTensor(env, FloatBuffer.wrap(in), new long[]{1, 2, N});
                     OrtSession.Result r = sess.run(Collections.singletonMap("mix", x))) {
                    FloatBuffer o = ((OnnxTensor) r.get(0)).getFloatBuffer();
                    for (int i = 0; i < len; i++) {
                        float l = 0, rr = 0;
                        for (int s = 0; s < 4; s++) {
                            if (s == VOCALS) continue;
                            l += o.get((s * 2) * N + i);
                            rr += o.get((s * 2 + 1) * N + i);
                        }
                        // 곡 맨 앞·맨 끝은 겹칠 상대가 없으니 줄이지 않는다
                        float w = (c == 0 && i < OV) || (last && len == N && i >= N - OV) ? 1f : win[i];
                        accL[i] += l * w;
                        accR[i] += rr * w;
                        wgt[i] += w;
                    }
                }
                // 다음 덩어리가 건드리지 않는 앞부분을 끝내 적는다
                int done = last ? len : STRIDE;
                for (int i = 0; i < done; i++) {
                    float w = Math.max(wgt[i], 1e-4f);
                    enc.put(accL[i] / w, accR[i] / w);
                }
                if (last) break;
                System.arraycopy(accL, STRIDE, accL, 0, OV);
                System.arraycopy(accR, STRIDE, accR, 0, OV);
                System.arraycopy(wgt, STRIDE, wgt, 0, OV);
                for (int i = OV; i < N; i++) { accL[i] = 0; accR[i] = 0; wgt[i] = 0; }
                pr.on(0.05 + 0.94 * (c + 1) / (double) chunks);
            }
            ok = true;
        } finally {
            enc.finish();
            pcm.delete();
            if (!ok) part.delete();
            so.close();
        }
        if (out.exists()) out.delete();
        if (!part.renameTo(out)) throw new Exception("save_failed");
        pr.on(1);
        return out;
    }

    /** 16비트 표본을 DataInputStream(빅 엔디언)으로 바로 읽을 수 있게 빅 엔디언으로 적는다 */
    static class PcmFile implements PcmSink, AutoCloseable {
        final OutputStream o;
        long frames = 0;
        PcmFile(OutputStream o) { this.o = o; }
        private void w(float v) {
            int s = Math.round(Math.max(-1f, Math.min(1f, v)) * 32767f);
            try { o.write((s >> 8) & 0xff); o.write(s & 0xff); } catch (Exception e) { throw new RuntimeException(e); }
        }
        @Override public void put(float l, float r) { w(l); w(r); frames++; }
        @Override public void close() throws Exception { o.close(); }
    }
}
