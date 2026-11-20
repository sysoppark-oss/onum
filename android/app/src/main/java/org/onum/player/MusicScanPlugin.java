package org.onum.player;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioDeviceCallback;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/** 휴대폰 안의 음악을 MediaStore에서 찾아 온다. 파일은 기기 밖으로 보내지 않는다. */
@CapacitorPlugin(
    name = "MusicScan",
    permissions = {
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "notify", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class MusicScanPlugin extends Plugin {

    private static MusicScanPlugin inst;

    /** 알림·잠금 화면·차 버튼 → 화면(JS) */
    static void emit(String action) {
        MusicScanPlugin p = inst;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("action", action);
        p.notifyListeners("mediaAction", o, true);
    }

    static void emitSeek(long ms) {
        MusicScanPlugin p = inst;
        if (p == null) return;
        JSObject o = new JSObject();
        o.put("action", "seek");
        o.put("pos", ms / 1000.0);
        p.notifyListeners("mediaAction", o, true);
    }

    private AudioDeviceCallback deviceCallback;
    private BroadcastReceiver volumeReceiver;

    @Override
    public void load() {
        inst = this;
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        deviceCallback = new AudioDeviceCallback() {
            @Override
            public void onAudioDevicesAdded(AudioDeviceInfo[] added) {
                notifyListeners("outputChanged", currentOutput());
            }

            @Override
            public void onAudioDevicesRemoved(AudioDeviceInfo[] removed) {
                notifyListeners("outputChanged", currentOutput());
            }
        };
        am.registerAudioDeviceCallback(deviceCallback, new Handler(Looper.getMainLooper()));

        // 휴대폰 옆 음량 버튼을 누르면 화면에도 알려 준다
        volumeReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                notifyListeners("volumeChanged", currentVolume());
            }
        };
        ContextCompat.registerReceiver(
            getContext(),
            volumeReceiver,
            new IntentFilter("android.media.VOLUME_CHANGED_ACTION"),
            ContextCompat.RECEIVER_EXPORTED
        );
    }

    @Override
    protected void handleOnDestroy() {
        if (volumeReceiver != null) {
            try { getContext().unregisterReceiver(volumeReceiver); } catch (Exception ignored) {}
        }
        if (deviceCallback != null) {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            am.unregisterAudioDeviceCallback(deviceCallback);
        }
    }

    /** 소리가 나가는 곳: 블루투스 > 유선 이어폰 > 휴대폰 스피커 */
    private JSObject currentOutput() {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        String kind = "speaker";
        String name = null;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                || t == AudioDeviceInfo.TYPE_BLE_HEADSET
                || t == AudioDeviceInfo.TYPE_BLE_SPEAKER
                || t == AudioDeviceInfo.TYPE_HEARING_AID) {
                kind = "bluetooth";
                CharSequence n = d.getProductName();
                if (n != null) name = n.toString();
                break;
            }
            if (t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                || t == AudioDeviceInfo.TYPE_WIRED_HEADSET
                || t == AudioDeviceInfo.TYPE_USB_HEADSET) {
                kind = "wired";
            }
        }
        JSObject o = new JSObject();
        o.put("kind", kind);
        if (name != null) o.put("name", name);
        return o;
    }

    private JSObject currentVolume() {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        JSObject o = new JSObject();
        o.put("value", am.getStreamVolume(AudioManager.STREAM_MUSIC));
        o.put("max", am.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        return o;
    }

    @PluginMethod
    public void volume(PluginCall call) {
        call.resolve(currentVolume());
    }

    /** 미디어 음량을 바꾼다. 화면에 우리 표시가 있으니 시스템 음량 창은 띄우지 않는다. */
    @PluginMethod
    public void setVolume(PluginCall call) {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        int max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
        int v = Math.max(0, Math.min(max, call.getInt("value", 0)));
        try {
            am.setStreamVolume(AudioManager.STREAM_MUSIC, v, 0);
            call.resolve(currentVolume());
        } catch (SecurityException e) {
            call.reject("volume_blocked", e);
        }
    }

    /** 배터리 최적화에서 빠져 있는지(빠져 있어야 화면이 꺼져도 오래 재생된다) */
    @PluginMethod
    public void battery(PluginCall call) {
        android.os.PowerManager pm = (android.os.PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject o = new JSObject();
        o.put("free", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        o.put("maker", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());
        call.resolve(o);
    }

    /** "배터리 사용량 최적화 중지" 묻는 창을 띄운다. 막히면 앱 정보 화면을 연다. */
    @PluginMethod
    public void askBattery(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            i.setData(Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(Uri.parse("package:" + ctx.getPackageName()));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    /** 앱 정보 화면(삼성: 배터리 › 제한 없음을 여기서 고른다) */
    @PluginMethod
    public void appSettings(PluginCall call) {
        try {
            Intent i = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception ignored) {}
        call.resolve();
    }

    /** 소리 모양·소리 크기: 곡을 bars 구간으로 나눠 구간마다 1초씩만 풀어 잰다(긴 강의도 빠르고 메모리를 적게 쓴다) */
    @PluginMethod
    public void analyze(PluginCall call) {
        String path = call.getString("path");
        int bars = call.getInt("bars", 76);
        if (path == null) { call.reject("no_path"); return; }
        new Thread(() -> {
            try { call.resolve(runAnalyze(path, bars)); }
            catch (Exception e) { call.reject("analyze_failed", e); }
        }).start();
    }

    private JSObject runAnalyze(String path, int bars) throws Exception {
        android.media.MediaExtractor ex = new android.media.MediaExtractor();
        android.media.MediaCodec codec = null;
        try {
            ex.setDataSource(path);
            int track = -1;
            android.media.MediaFormat fmt = null;
            for (int i = 0; i < ex.getTrackCount(); i++) {
                android.media.MediaFormat f = ex.getTrackFormat(i);
                String m = f.getString(android.media.MediaFormat.KEY_MIME);
                if (m != null && m.startsWith("audio/")) { track = i; fmt = f; break; }
            }
            if (track < 0 || fmt == null) throw new Exception("no_audio");
            ex.selectTrack(track);
            long durUs = fmt.containsKey(android.media.MediaFormat.KEY_DURATION) ? fmt.getLong(android.media.MediaFormat.KEY_DURATION) : 0;
            if (durUs <= 0) throw new Exception("no_duration");
            int fs = fmt.getInteger(android.media.MediaFormat.KEY_SAMPLE_RATE);
            int ch = fmt.getInteger(android.media.MediaFormat.KEY_CHANNEL_COUNT);
            boolean isFloat = false;
            codec = android.media.MediaCodec.createDecoderByType(fmt.getString(android.media.MediaFormat.KEY_MIME));
            codec.configure(fmt, null, null, 0);
            codec.start();
            android.media.MediaCodec.BufferInfo info = new android.media.MediaCodec.BufferInfo();
            long win = Math.max(200_000L, Math.min(1_000_000L, durUs / bars));
            double[] rms = new double[bars];
            Loudness loud = null;
            int loudFs = 0;
            for (int b = 0; b < bars; b++) {
                long at = (long) ((b + 0.5) * durUs / bars) - win / 2;
                if (at < 0) at = 0;
                ex.seekTo(at, android.media.MediaExtractor.SEEK_TO_PREVIOUS_SYNC);
                codec.flush();
                float[] buf = new float[0];
                int got = 0;
                boolean inEos = false, outEos = false;
                int guard = 0;
                while (!outEos && guard++ < 600) {
                    int cap = (int) (fs * ch * win / 1_000_000L);
                    if (got >= cap && cap > 0) break;
                    if (!inEos) {
                        int ii = codec.dequeueInputBuffer(10_000);
                        if (ii >= 0) {
                            java.nio.ByteBuffer ib = codec.getInputBuffer(ii);
                            int n = ib == null ? -1 : ex.readSampleData(ib, 0);
                            if (n < 0) {
                                codec.queueInputBuffer(ii, 0, 0, 0, android.media.MediaCodec.BUFFER_FLAG_END_OF_STREAM);
                                inEos = true;
                            } else {
                                codec.queueInputBuffer(ii, 0, n, ex.getSampleTime(), 0);
                                ex.advance();
                            }
                        }
                    }
                    int oi = codec.dequeueOutputBuffer(info, 10_000);
                    if (oi == android.media.MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                        android.media.MediaFormat of = codec.getOutputFormat();
                        if (of.containsKey(android.media.MediaFormat.KEY_SAMPLE_RATE)) fs = of.getInteger(android.media.MediaFormat.KEY_SAMPLE_RATE);
                        if (of.containsKey(android.media.MediaFormat.KEY_CHANNEL_COUNT)) ch = of.getInteger(android.media.MediaFormat.KEY_CHANNEL_COUNT);
                        if (of.containsKey(android.media.MediaFormat.KEY_PCM_ENCODING))
                            isFloat = of.getInteger(android.media.MediaFormat.KEY_PCM_ENCODING) == android.media.AudioFormat.ENCODING_PCM_FLOAT;
                    } else if (oi >= 0) {
                        java.nio.ByteBuffer ob = codec.getOutputBuffer(oi);
                        if (ob != null && info.size > 0 && info.presentationTimeUs >= at - 50_000) {
                            ob.position(info.offset);
                            ob.limit(info.offset + info.size);
                            java.nio.ByteBuffer o2 = ob.slice().order(java.nio.ByteOrder.nativeOrder());
                            int n = isFloat ? info.size / 4 : info.size / 2;
                            if (got + n > buf.length) buf = java.util.Arrays.copyOf(buf, Math.max(got + n, buf.length * 2));
                            if (isFloat) { java.nio.FloatBuffer fb = o2.asFloatBuffer(); for (int k = 0; k < n; k++) buf[got++] = fb.get(k); }
                            else { java.nio.ShortBuffer sb = o2.asShortBuffer(); for (int k = 0; k < n; k++) buf[got++] = sb.get(k) / 32768f; }
                        }
                        codec.releaseOutputBuffer(oi, false);
                        if ((info.flags & android.media.MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) outEos = true;
                    }
                }
                int frames = ch > 0 ? got / ch : 0;
                if (frames == 0) continue;
                double[][] chs = new double[ch][frames];
                double sum = 0;
                for (int f = 0; f < frames; f++) {
                    double mono = 0;
                    for (int c = 0; c < ch; c++) { double v = buf[f * ch + c]; chs[c][f] = v; mono += v; }
                    mono /= ch;
                    sum += mono * mono;
                }
                rms[b] = Math.sqrt(sum / frames);
                if (loud == null) { loud = new Loudness(fs); loudFs = fs; }
                if (fs == loudFs) loud.add(chs, fs / 20);
            }
            JSArray arr = new JSArray();
            for (double v : rms) arr.put(v);
            JSObject o = new JSObject();
            o.put("rms", arr);
            double l = loud == null ? Double.NaN : loud.integrated();
            if (!Double.isNaN(l)) o.put("lufs", l);
            return o;
        } finally {
            if (codec != null) { try { codec.stop(); } catch (Exception ignored) {} try { codec.release(); } catch (Exception ignored) {} }
            ex.release();
        }
    }

    /** 휴대폰 설정의 글자 크기 배율 */
    @PluginMethod
    public void fontScale(PluginCall call) {
        JSObject o = new JSObject();
        o.put("scale", (double) getContext().getResources().getConfiguration().fontScale);
        call.resolve(o);
    }

    @PluginMethod
    public void output(PluginCall call) {
        call.resolve(currentOutput());
    }

    private String alias() {
        return Build.VERSION.SDK_INT >= 33 ? "audio" : "storage";
    }

    @PluginMethod
    public void scan(PluginCall call) {
        if (getPermissionState(alias()) != PermissionState.GRANTED) {
            requestPermissionForAlias(alias(), call, "permCallback");
            return;
        }
        doScan(call);
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        if (getPermissionState(alias()) == PermissionState.GRANTED) {
            doScan(call);
        } else {
            call.reject("permission_denied");
        }
    }

    private void doScan(PluginCall call) {
        int minMs = call.getInt("minMs", 30000);
        ContentResolver cr = getContext().getContentResolver();
        Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;
        java.util.ArrayList<String> colList = new java.util.ArrayList<>(java.util.Arrays.asList(
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.SIZE,
            MediaStore.Audio.Media.IS_PODCAST
        ));
        // 강의 구분에 쓰는 휴대폰 표시: 오디오북(안드로이드 10+), 장르·음질(안드로이드 11+)
        boolean q = android.os.Build.VERSION.SDK_INT >= 29;
        boolean r = android.os.Build.VERSION.SDK_INT >= 30;
        if (q) colList.add(MediaStore.Audio.Media.IS_AUDIOBOOK);
        if (r) { colList.add(MediaStore.Audio.Media.GENRE); colList.add(MediaStore.Audio.Media.BITRATE); }
        String[] cols = colList.toArray(new String[0]);
        // 벨소리·알림음·알람은 빼고 음악·팟캐스트·오디오북만
        String kinds = MediaStore.Audio.Media.IS_MUSIC + " != 0 OR " + MediaStore.Audio.Media.IS_PODCAST + " != 0"
            + (q ? " OR " + MediaStore.Audio.Media.IS_AUDIOBOOK + " != 0" : "");
        String sel = "(" + kinds + ") AND " + MediaStore.Audio.Media.DURATION + " >= ?";
        String[] args = { String.valueOf(minMs) };

        JSArray out = new JSArray();
        int skipped = 0;
        try (Cursor c = cr.query(uri, cols, sel, args, null)) {
            if (c != null) {
                while (c.moveToNext()) {
                    String path = c.getString(6);
                    if (path == null) continue;
                    String lower = path.toLowerCase();
                    // 통화·음성 녹음 폴더는 음악 목록에서 뺀다
                    if (lower.contains("/call/") || lower.contains("/recordings/")
                        || lower.contains("/voice recorder/") || lower.contains("/recorder/")
                        || lower.contains("/sounds/")) {
                        skipped++;
                        continue;
                    }
                    String[] parts = path.split("/");
                    JSObject t = new JSObject();
                    t.put("id", c.getLong(0));
                    t.put("title", c.getString(1));
                    t.put("artist", c.getString(2));
                    t.put("album", c.getString(3));
                    t.put("albumId", c.getLong(4));
                    t.put("duration", c.getLong(5) / 1000.0);
                    t.put("path", path);
                    t.put("folder", parts.length > 1 ? parts[parts.length - 2] : "");
                    t.put("added", c.getLong(7));
                    t.put("size", c.getLong(8));
                    boolean talk = c.getInt(9) != 0;
                    if (q) talk = talk || c.getInt(c.getColumnIndexOrThrow(MediaStore.Audio.Media.IS_AUDIOBOOK)) != 0;
                    t.put("talkFlag", talk);
                    if (r) {
                        String g = c.getString(c.getColumnIndexOrThrow(MediaStore.Audio.Media.GENRE));
                        if (g != null) t.put("genre", g);
                        t.put("bitrate", c.getLong(c.getColumnIndexOrThrow(MediaStore.Audio.Media.BITRATE)));
                    }
                    out.put(t);
                }
            }
        } catch (Exception e) {
            call.reject("scan_failed", e);
            return;
        }
        JSObject ret = new JSObject();
        ret.put("tracks", out);
        ret.put("skippedFolder", skipped);
        call.resolve(ret);
    }

    /** 앨범 그림을 작은 JPEG로 돌려준다. 없으면 빈 값. */
    @PluginMethod
    public void art(PluginCall call) {
        long id = call.getLong("id", -1L);
        long albumId = call.getLong("albumId", -1L);
        int px = call.getInt("size", 320);
        Bitmap bmp = null;
        ContentResolver cr = getContext().getContentResolver();
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                Uri u = ContentUris.withAppendedId(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, id);
                bmp = cr.loadThumbnail(u, new Size(px, px), null);
            } else {
                Uri u = ContentUris.withAppendedId(Uri.parse("content://media/external/audio/albumart"), albumId);
                try (InputStream in = cr.openInputStream(u)) {
                    if (in != null) bmp = BitmapFactory.decodeStream(in);
                }
            }
        } catch (Exception ignored) {
            // 그림이 없는 곡
        }
        JSObject ret = new JSObject();
        if (bmp != null) {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.JPEG, 82, bos);
            ret.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP));
        }
        call.resolve(ret);
    }

    /** 재생 알림·잠금 화면을 지금 상태로. 재생 중이면 포그라운드로 붙잡고, 멈추면 알림만 남긴다. stop이면 알림을 없앤다. */
    @PluginMethod
    public void nowPlaying(PluginCall call) {
        Intent i = new Intent(getContext(), PlaybackService.class);
        if (call.getBoolean("stop", false)) {
            getContext().stopService(i);
            call.resolve();
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notify") != PermissionState.GRANTED && call.getBoolean("playing", false)) {
            requestPermissionForAlias("notify", call, "notifyCallback");
            return;
        }
        startService(call, i);
    }

    @PermissionCallback
    private void notifyCallback(PluginCall call) {
        // 알림을 거절해도 재생은 계속한다
        startService(call, new Intent(getContext(), PlaybackService.class));
    }

    private void startService(PluginCall call, Intent i) {
        i.putExtra("title", call.getString("title", "온음"));
        i.putExtra("artist", call.getString("artist", ""));
        i.putExtra("playing", call.getBoolean("playing", false));
        i.putExtra("pos", (long) (call.getDouble("pos", 0.0) * 1000));
        i.putExtra("dur", (long) (call.getDouble("dur", 0.0) * 1000));
        i.putExtra("rate", call.getFloat("rate", 1f));
        try {
            // 재생은 포그라운드로, 멈춤은 알림만 고친다(백그라운드에서 포그라운드 시작은 막혀 있다)
            if (Build.VERSION.SDK_INT >= 26 && call.getBoolean("playing", false)) getContext().startForegroundService(i);
            else getContext().startService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("service_failed", e);
        }
    }
}
