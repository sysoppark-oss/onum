package org.onum.player;

import android.content.Context;

import com.k2fsa.sherpa.onnx.OfflineModelConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizer;
import com.k2fsa.sherpa.onnx.OfflineRecognizerConfig;
import com.k2fsa.sherpa.onnx.OfflineRecognizerResult;
import com.k2fsa.sherpa.onnx.OfflineStream;
import com.k2fsa.sherpa.onnx.OfflineWhisperModelConfig;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 가사 자동 맞추기: 사용자가 고를 때만 AI 모델(Whisper base, 약 160MB)을 받아 이 휴대폰 안에서만 돌린다.
 * 노래를 16kHz로 풀어 25초씩(2초 겹침) 받아쓰고, 낱말마다 시각을 돌려준다. 짝짓기는 앱(align.ts)이 한다.
 * 노래·가사는 밖으로 보내지 않는다. 인터넷은 모델을 받을 때만 쓴다.
 */
final class AiLyrics {
    private AiLyrics() {}

    static final String BASE = "https://github.com/sysoppark-oss/onum/releases/download/ai-models/";
    static final String[] FILES = { "whisper-base-encoder.int8.onnx", "whisper-base-decoder.int8.onnx", "whisper-base-tokens.txt" };
    private static OfflineRecognizer rec;
    private static String recLang = "";

    interface Progress { void on(String stage, long done, long total); }

    private static Boolean libs;

    /** 64비트 휴대폰에서만 돈다(앱이 무거워지지 않게 32비트용 엔진은 넣지 않았다) */
    static synchronized boolean supported() {
        if (libs != null) return libs;
        try { System.loadLibrary("onnxruntime"); System.loadLibrary("sherpa-onnx-jni"); libs = true; }
        catch (Throwable e) { libs = false; }
        return libs;
    }

    static File dir(Context c) { return new File(c.getFilesDir(), "ai"); }

    static boolean ready(Context c) {
        for (String f : FILES) if (!new File(dir(c), f).isFile()) return false;
        return true;
    }

    static long bytes(Context c) {
        long n = 0;
        for (String f : FILES) n += new File(dir(c), f).length();
        return n;
    }

    static synchronized void remove(Context c) {
        if (rec != null) { rec.release(); rec = null; recLang = ""; }
        File d = dir(c);
        File[] fs = d.listFiles();
        if (fs != null) for (File f : fs) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    /** 모델 받기: SHA256SUMS로 하나하나 확인한다. 중간에 끊기면 다음에 처음부터 */
    static void download(Context c, Progress p) throws Exception {
        File d = dir(c);
        if (!d.isDirectory() && !d.mkdirs()) throw new Exception("no_dir");
        Map<String, String> sums = new HashMap<>();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(open(BASE + "SHA256SUMS"), StandardCharsets.UTF_8))) {
            String line;
            while ((line = r.readLine()) != null) {
                String[] a = line.trim().split("\\s+");
                if (a.length == 2) sums.put(a[1].replace("*", ""), a[0]);
            }
        }
        long total = 0;
        long[] sizes = new long[FILES.length];
        for (int i = 0; i < FILES.length; i++) { sizes[i] = size(BASE + FILES[i]); total += Math.max(0, sizes[i]); }
        long done = 0;
        for (int i = 0; i < FILES.length; i++) {
            String f = FILES[i];
            File out = new File(d, f), part = new File(d, f + ".part");
            String want = sums.get(f);
            if (out.isFile() && want != null && want.equalsIgnoreCase(sha(out))) { done += out.length(); p.on("download", done, total); continue; }
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            try (InputStream in = open(BASE + f); FileOutputStream o = new FileOutputStream(part)) {
                byte[] buf = new byte[1 << 16];
                int n;
                long last = 0;
                while ((n = in.read(buf)) > 0) {
                    o.write(buf, 0, n);
                    md.update(buf, 0, n);
                    done += n;
                    if (done - last > 512 * 1024) { last = done; p.on("download", done, total); }
                }
            }
            String got = hex(md.digest());
            if (want == null || !want.equalsIgnoreCase(got)) { //noinspection ResultOfMethodCallIgnored
                part.delete(); throw new Exception("checksum"); }
            if (out.exists()) //noinspection ResultOfMethodCallIgnored
                out.delete();
            if (!part.renameTo(out)) throw new Exception("rename");
            p.on("download", done, total);
        }
    }

    private static InputStream open(String url) throws Exception {
        String u = url;
        for (int hop = 0; hop < 6; hop++) {
            HttpURLConnection h = (HttpURLConnection) new URL(u).openConnection();
            h.setInstanceFollowRedirects(false);
            h.setConnectTimeout(15000);
            h.setReadTimeout(30000);
            int code = h.getResponseCode();
            if (code >= 300 && code < 400) { u = h.getHeaderField("Location"); h.disconnect(); continue; }
            if (code != 200) throw new Exception("http_" + code);
            return h.getInputStream();
        }
        throw new Exception("redirects");
    }

    private static long size(String url) {
        try {
            String u = url;
            for (int hop = 0; hop < 6; hop++) {
                HttpURLConnection h = (HttpURLConnection) new URL(u).openConnection();
                h.setInstanceFollowRedirects(false);
                h.setRequestMethod("HEAD");
                int code = h.getResponseCode();
                if (code >= 300 && code < 400) { u = h.getHeaderField("Location"); h.disconnect(); continue; }
                long n = h.getContentLengthLong();
                h.disconnect();
                return n;
            }
        } catch (Exception ignored) { }
        return -1;
    }

    private static String sha(File f) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        try (InputStream in = new FileInputStream(f)) {
            byte[] buf = new byte[1 << 16];
            int n;
            while ((n = in.read(buf)) > 0) md.update(buf, 0, n);
        }
        return hex(md.digest());
    }

    private static String hex(byte[] b) {
        StringBuilder s = new StringBuilder();
        for (byte x : b) s.append(String.format("%02x", x));
        return s.toString();
    }

    private static synchronized OfflineRecognizer recognizer(Context c, String lang) {
        if (rec != null && recLang.equals(lang)) return rec;
        if (rec != null) { rec.release(); rec = null; }
        File d = dir(c);
        OfflineWhisperModelConfig w = new OfflineWhisperModelConfig();
        w.setEncoder(new File(d, FILES[0]).getAbsolutePath());
        w.setDecoder(new File(d, FILES[1]).getAbsolutePath());
        w.setLanguage(lang);
        w.setTask("transcribe");
        w.setEnableTokenTimestamps(true);
        OfflineModelConfig m = new OfflineModelConfig();
        m.setWhisper(w);
        m.setTokens(new File(d, FILES[2]).getAbsolutePath());
        m.setModelType("whisper");
        m.setNumThreads(Math.max(1, Math.min(4, Runtime.getRuntime().availableProcessors() - 1)));
        OfflineRecognizerConfig cfg = new OfflineRecognizerConfig();
        cfg.setModelConfig(m);
        cfg.setDecodingMethod("greedy_search");
        rec = new OfflineRecognizer(null, cfg);
        recLang = lang;
        return rec;
    }

    /** 받아쓰기: [낱말, 시각, 낱말, 시각, …] (시각은 곡 처음부터 초) */
    static List<Object> transcribe(Context c, String path, String lang, Progress p) throws Exception {
        final int SR = 16000, WIN = 25 * SR, HOP = 23 * SR;
        float[] pcm;
        try (Analyzer an = new Analyzer(path)) { pcm = an.mono(SR, 15 * 60); }
        if (pcm.length < SR) throw new Exception("too_short");
        OfflineRecognizer r = recognizer(c, lang);
        List<Object> out = new ArrayList<>();
        int windows = Math.max(1, (int) Math.ceil(Math.max(0, pcm.length - WIN) / (double) HOP) + 1);
        float kept = 0; // 앞 창에서 이미 낸 마지막 시각
        for (int w = 0; w < windows; w++) {
            int s = w * HOP, e = Math.min(pcm.length, s + WIN);
            if (s >= e) break;
            float[] chunk = new float[e - s];
            System.arraycopy(pcm, s, chunk, 0, e - s);
            OfflineStream st = r.createStream();
            st.acceptWaveform(chunk, SR);
            r.decode(st);
            OfflineRecognizerResult res = r.getResult(st);
            st.release();
            String[] toks = res.getTokens();
            float[] ts = res.getTimestamps();
            float base = s / (float) SR;
            // 겹친 2초: 앞 창이 낸 시각보다 뒤인 낱말만, 마지막 창이 아니면 창 끝 1초 전까지만
            float cut = (w == windows - 1) ? Float.MAX_VALUE : base + (WIN - SR) / (float) SR;
            for (int i = 0; i < toks.length && i < ts.length; i++) {
                float t = base + ts[i];
                if (t <= kept || t > cut) continue;
                out.add(toks[i]);
                out.add(t);
                kept = t;
            }
            p.on("listen", w + 1, windows);
        }
        return out;
    }
}
