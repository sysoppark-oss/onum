package org.onum.player;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Size;

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
