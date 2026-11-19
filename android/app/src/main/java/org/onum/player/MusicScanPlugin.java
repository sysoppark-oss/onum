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

    private AudioDeviceCallback deviceCallback;
    private BroadcastReceiver volumeReceiver;

    @Override
    public void load() {
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
        String[] cols = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.SIZE
        };
        // 벨소리·알림음·알람은 빼고 음악만
        String sel = MediaStore.Audio.Media.IS_MUSIC + " != 0 AND "
            + MediaStore.Audio.Media.DURATION + " >= ?";
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

    /** 화면이 꺼져도 음악이 멈추지 않게 재생 알림(포그라운드 서비스)을 켜고 끈다. */
    @PluginMethod
    public void nowPlaying(PluginCall call) {
        boolean playing = call.getBoolean("playing", false);
        Intent i = new Intent(getContext(), PlaybackService.class);
        if (playing) {
            if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notify") != PermissionState.GRANTED) {
                requestPermissionForAlias("notify", call, "notifyCallback");
                return;
            }
            startService(call, i);
        } else {
            getContext().stopService(i);
            call.resolve();
        }
    }

    @PermissionCallback
    private void notifyCallback(PluginCall call) {
        // 알림을 거절해도 재생은 계속한다
        startService(call, new Intent(getContext(), PlaybackService.class));
    }

    private void startService(PluginCall call, Intent i) {
        i.putExtra("title", call.getString("title", "온음"));
        i.putExtra("artist", call.getString("artist", ""));
        try {
            if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i);
            else getContext().startService(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("service_failed", e);
        }
    }
}
