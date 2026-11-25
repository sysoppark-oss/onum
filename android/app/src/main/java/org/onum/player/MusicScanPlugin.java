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
import android.os.Environment;
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
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** 휴대폰 안의 음악을 MediaStore에서 찾아 온다. 파일은 기기 밖으로 보내지 않는다. */
@CapacitorPlugin(
    name = "MusicScan",
    permissions = {
        @Permission(alias = "audio", strings = { Manifest.permission.READ_MEDIA_AUDIO }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "notify", strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = "nearby", strings = { Manifest.permission.BLUETOOTH_CONNECT })
    }
)
public class MusicScanPlugin extends Plugin {

    static MusicScanPlugin inst; // 앱이 열려 있는 동안만(위젯·알림 버튼을 화면에 넘길 곳)

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
        NowWidget.update(getContext()); // 위젯 버튼을 「화면에 넘기기」로
        // 예전 판에서 받아 둔 가사 맞추기 AI 모델(약 160MB)은 이제 쓰지 않으니 지운다
        new Thread(() -> {
            java.io.File d = new java.io.File(getContext().getFilesDir(), "ai");
            java.io.File[] fs = d.listFiles();
            if (fs != null) for (java.io.File f : fs) //noinspection ResultOfMethodCallIgnored
                f.delete();
            //noinspection ResultOfMethodCallIgnored
            d.delete();
        }).start();
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
        if (inst == this) inst = null;
        NowWidget.update(getContext()); // 앱이 닫히면 위젯 버튼은 「앱 열기」로
        if (volumeReceiver != null) {
            try { getContext().unregisterReceiver(volumeReceiver); } catch (Exception ignored) {}
        }
        if (deviceCallback != null) {
            AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            am.unregisterAudioDeviceCallback(deviceCallback);
        }
    }

    /** 블루투스 기기가 차 오디오인지(차·핸즈프리 분류). 알 수 없으면 null */
    @android.annotation.SuppressLint("MissingPermission")
    private Boolean isCar(AudioDeviceInfo d) {
        if (Build.VERSION.SDK_INT < 28) return null;
        if (Build.VERSION.SDK_INT >= 31 && ContextCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT)
            != android.content.pm.PackageManager.PERMISSION_GRANTED) return null;
        try {
            String addr = d.getAddress();
            if (addr == null || addr.isEmpty()) return null;
            android.bluetooth.BluetoothManager bm = (android.bluetooth.BluetoothManager) getContext().getSystemService(Context.BLUETOOTH_SERVICE);
            android.bluetooth.BluetoothAdapter ad = bm != null ? bm.getAdapter() : null;
            if (ad == null) return null;
            android.bluetooth.BluetoothClass c = ad.getRemoteDevice(addr).getBluetoothClass();
            if (c == null) return null;
            int k = c.getDeviceClass();
            return k == android.bluetooth.BluetoothClass.Device.AUDIO_VIDEO_CAR_AUDIO
                || k == android.bluetooth.BluetoothClass.Device.AUDIO_VIDEO_HANDSFREE;
        } catch (Exception e) {
            return null;
        }
    }

    /** "근처 기기" 권한을 묻는다(차 오디오인지 알아보려고). 답한 뒤 소리 나가는 곳을 다시 알려 준다 */
    @PluginMethod
    public void askNearby(PluginCall call) {
        if (Build.VERSION.SDK_INT < 31 || getPermissionState("nearby") == PermissionState.GRANTED) {
            call.resolve(currentOutput());
            return;
        }
        requestPermissionForAlias("nearby", call, "nearbyCallback");
    }

    @PermissionCallback
    private void nearbyCallback(PluginCall call) {
        JSObject o = currentOutput();
        notifyListeners("outputChanged", o);
        call.resolve(o);
    }

    /** 소리가 나가는 곳: 블루투스 > 유선 이어폰 > 휴대폰 스피커 */
    private JSObject currentOutput() {
        AudioManager am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        String kind = "speaker";
        String name = null;
        Boolean car = null;
        for (AudioDeviceInfo d : am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)) {
            int t = d.getType();
            if (t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP
                || t == AudioDeviceInfo.TYPE_BLE_HEADSET
                || t == AudioDeviceInfo.TYPE_BLE_SPEAKER
                || t == AudioDeviceInfo.TYPE_HEARING_AID) {
                kind = "bluetooth";
                CharSequence n = d.getProductName();
                if (n != null) name = n.toString();
                car = isCar(d);
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
        if (car != null) o.put("car", car.booleanValue());
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

    /**
     * 가사를 .lrc 파일로 곡 옆에 저장: 휴대폰의 「저장 위치 고르기」 창을 곡이 있는 폴더에서 연다.
     * 사용자가 「저장」을 누른 자리에만 쓴다(앱이 저장소 전체를 쓸 권한은 없다).
     */
    @PluginMethod
    public void saveLrc(PluginCall call) {
        String name = call.getString("name", "lyrics.lrc");
        String path = call.getString("path");
        Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/octet-stream"); // text/plain이면 .txt가 붙는 폰이 있다
        i.putExtra(Intent.EXTRA_TITLE, name);
        if (Build.VERSION.SDK_INT >= 26 && path != null) {
            String root = Environment.getExternalStorageDirectory().getAbsolutePath() + "/";
            int cut = path.lastIndexOf('/');
            if (path.startsWith(root) && cut > root.length()) {
                String rel = path.substring(root.length(), cut);
                i.putExtra(android.provider.DocumentsContract.EXTRA_INITIAL_URI,
                    android.provider.DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:" + rel));
            }
        }
        try { startActivityForResult(call, i, "lrcSaved"); } catch (Exception e) { call.reject("no_picker"); }
    }

    @ActivityCallback
    private void lrcSaved(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Uri u = result.getData() == null ? null : result.getData().getData();
        if (result.getResultCode() != android.app.Activity.RESULT_OK || u == null) { JSObject o = new JSObject(); o.put("saved", false); call.resolve(o); return; }
        try (OutputStream out = getContext().getContentResolver().openOutputStream(u, "wt")) {
            out.write(call.getString("text", "").getBytes(java.nio.charset.StandardCharsets.UTF_8));
            JSObject o = new JSObject(); o.put("saved", true); call.resolve(o);
        } catch (Exception e) { call.reject("write_failed"); }
    }

    /** 새 시험판 내려받기 주소를 브라우저로 연다(앱이 직접 설치하지 않는다: Play 프로텍트가 설치 권한 앱을 막기 때문) */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("bad_url"); return; }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** 편집곡을 진짜 음악 파일로: parts [{path, s, e}], name. 진행은 exportProgress 알림으로 */
    @PluginMethod
    public void exportClips(PluginCall call) {
        JSArray arr = call.getArray("parts");
        String name = call.getString("name", "온음 편집곡");
        if (arr == null || arr.length() == 0) { call.reject("no_parts"); return; }
        Exporter.Clip[] clips = new Exporter.Clip[arr.length()];
        try {
            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject o = arr.getJSONObject(i);
                clips[i] = new Exporter.Clip(o.getString("path"), o.getDouble("s"), o.getDouble("e"));
            }
        } catch (Exception e) { call.reject("bad_parts", e); return; }
        new Thread(() -> {
            try {
                long[] last = {0};
                String where = Exporter.run(getContext(), clips, name, (f) -> {
                    long now = System.currentTimeMillis();
                    if (now - last[0] < 250) return;
                    last[0] = now;
                    JSObject o = new JSObject();
                    o.put("f", f);
                    notifyListeners("exportProgress", o);
                });
                JSObject r = new JSObject();
                r.put("where", where);
                call.resolve(r);
            } catch (Exception e) { call.reject("export_failed", e); }
        }).start();
    }

    /** 노래방 녹음: 앱이 섞은 소리(PCM)를 조각조각 받아 임시 파일에 이어 쓴다 */
    @PluginMethod
    public void pcmWrite(PluginCall call) {
        String b64 = call.getString("b64", "");
        boolean first = Boolean.TRUE.equals(call.getBoolean("first", false));
        try {
            java.io.File f = new java.io.File(getContext().getCacheDir(), "onum-karaoke.pcm");
            if (first && f.exists()) f.delete();
            try (java.io.FileOutputStream os = new java.io.FileOutputStream(f, true)) {
                os.write(android.util.Base64.decode(b64, android.util.Base64.DEFAULT));
            }
            call.resolve();
        } catch (Exception e) { call.reject("pcm_write_failed", e); }
    }

    /** 이어 쓴 PCM을 .m4a로 만들어 「음악/온음/노래방」에 넣는다 */
    @PluginMethod
    public void pcmSave(PluginCall call) {
        String name = call.getString("name", "온음 노래방");
        String sub = call.getString("sub", "노래방");
        new Thread(() -> {
            java.io.File f = new java.io.File(getContext().getCacheDir(), "onum-karaoke.pcm");
            try {
                String where = Exporter.fromPcm(getContext(), f, name, sub);
                JSObject r = new JSObject();
                r.put("where", where);
                call.resolve(r);
            } catch (Exception e) { call.reject("pcm_save_failed", e); }
            finally { f.delete(); }
        }).start();
    }

    /** 노래방 AI 반주: 앱 안에 모델이 있는지, 이 곡의 반주를 이미 만들었는지 */
    @PluginMethod
    public void aiInfo(PluginCall call) {
        String id = call.getString("id", "");
        JSObject r = new JSObject();
        r.put("model", Splitter.hasModel(getContext()));
        com.getcapacitor.JSArray fs = new com.getcapacitor.JSArray();
        for (int k = 0; k < Splitter.KEEP.length; k++) {
            java.io.File f = Splitter.outFile(getContext(), id, k);
            fs.put(!id.isEmpty() && f.exists() && f.length() > 0 ? f.getAbsolutePath() : "");
        }
        r.put("files", fs);
        call.resolve(r);
    }

    /** 노래방 AI 반주 만들기. 진행은 aiProgress 알림으로 보낸다 */
    @PluginMethod
    public void aiSplit(PluginCall call) {
        String path = call.getString("path");
        String id = call.getString("id");
        double dur = call.getDouble("dur", 0.0);
        if (path == null || id == null) { call.reject("no_path"); return; }
        Thread th = new Thread(() -> {
            long t0 = System.currentTimeMillis();
            final long[] last = {0};
            try {
                java.io.File[] f = Splitter.run(getContext(), path, dur, id, x -> {
                    long now = System.currentTimeMillis();
                    if (now - last[0] < 400 && x < 1) return;
                    last[0] = now;
                    JSObject p = new JSObject();
                    p.put("id", id);
                    p.put("f", x);
                    notifyListeners("aiProgress", p);
                });
                JSObject r = new JSObject();
                com.getcapacitor.JSArray fs = new com.getcapacitor.JSArray();
                for (java.io.File x : f) fs.put(x.getAbsolutePath());
                r.put("files", fs);
                r.put("ms", System.currentTimeMillis() - t0);
                call.resolve(r);
            } catch (OutOfMemoryError e) {
                call.reject("ai_memory");
            } catch (Exception e) {
                call.reject("cancelled".equals(e.getMessage()) ? "ai_cancelled" : "ai_failed", e);
            }
        });
        th.setPriority(Thread.NORM_PRIORITY - 1);
        th.start();
    }

    @PluginMethod
    public void aiCancel(PluginCall call) { Splitter.cancel = true; call.resolve(); }

    /** 만든 AI 반주 지우기 */
    @PluginMethod
    public void aiDelete(PluginCall call) {
        String id = call.getString("id", "");
        if (!id.isEmpty()) for (int k = 0; k < Splitter.KEEP.length; k++) Splitter.outFile(getContext(), id, k).delete();
        call.resolve();
    }

    /** 강의의 조용한 구간: 처음부터 끝까지 50ms 창으로 재어, 0.7초 넘게 조용한 곳을 [시작, 끝](1/100초)으로 돌려준다 */
    @PluginMethod
    public void quiet(PluginCall call) {
        String path = call.getString("path");
        if (path == null) { call.reject("no_path"); return; }
        new Thread(() -> {
            try (Analyzer an = new Analyzer(path)) {
                float[] lv = an.levels(50);
                JSArray arr = new JSArray();
                for (int v : Quiet.find(lv, 50)) arr.put(v);
                JSObject o = new JSObject();
                o.put("q", arr);
                o.put("n", lv.length);
                call.resolve(o);
            } catch (Exception e) { call.reject("quiet_failed", e); }
        }).start();
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
        try (Analyzer an = new Analyzer(path)) {
            long durUs = an.durUs;
            long win = Math.max(200_000L, Math.min(1_000_000L, durUs / bars));
            double[] rms = new double[bars];
            Loudness loud = null;
            int loudFs = 0;
            double eL = 0, eR = 0; // 한쪽만 나오는 곡 찾기
            for (int b = 0; b < bars; b++) {
                long at = (long) ((b + 0.5) * durUs / bars) - win / 2;
                float[] buf = an.decode(Math.max(0, at), win);
                int ch = Math.max(1, an.ch), fs = an.fs;
                int frames = buf.length / ch;
                if (frames == 0) continue;
                double[][] chs = new double[ch][frames];
                double sum = 0;
                for (int f = 0; f < frames; f++) {
                    double mono = 0;
                    for (int c = 0; c < ch; c++) { double v = buf[f * ch + c]; chs[c][f] = v; mono += v; }
                    if (ch >= 2) { eL += chs[0][f] * chs[0][f]; eR += chs[1][f] * chs[1][f]; }
                    mono /= ch;
                    sum += mono * mono;
                }
                rms[b] = Math.sqrt(sum / frames);
                if (loud == null) { loud = new Loudness(fs); loudFs = fs; }
                if (fs == loudFs) loud.add(chs, fs / 20);
            }
            // 앞뒤 무음: 처음 15초, 마지막 20초
            double head = 0, tail = 0;
            float[] h = an.decode(0, 15_000_000L);
            int hw = an.loudWindow(h, true);
            if (hw > 0) head = hw * 0.05;
            long tailFrom = Math.max(0, durUs - 20_000_000L);
            float[] t = an.decode(tailFrom, durUs - tailFrom + 1_000_000L);
            int tw = an.loudWindow(t, false);
            if (tw >= 0) {
                int wins = t.length / (Math.max(1, an.fs / 20) * Math.max(1, an.ch));
                tail = Math.max(0, (wins - 1 - tw) * 0.05);
            }
            JSArray arr = new JSArray();
            for (double v : rms) arr.put(v);
            JSObject o = new JSObject();
            o.put("rms", arr);
            double l = loud == null ? Double.NaN : loud.integrated();
            if (!Double.isNaN(l)) o.put("lufs", l);
            o.put("head", head);
            o.put("tail", tail);
            double hi = Math.max(eL, eR), lo = Math.min(eL, eR);
            o.put("side", hi <= 1e-9 || lo > hi * 1e-4 ? 0 : (eL > eR ? 1 : 2));
            return o;
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
        i.putExtra("brand", call.getString("brand", ""));
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
