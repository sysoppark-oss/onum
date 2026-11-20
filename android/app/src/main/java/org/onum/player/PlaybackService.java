package org.onum.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.drawable.Icon;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * 재생 알림과 잠금 화면 조작(이전·재생/멈춤·다음).
 * 재생하는 동안은 포그라운드로 붙잡아 화면이 꺼져도 멈추지 않게 하고,
 * 멈추면 알림을 남겨 두되(밀어서 지울 수 있게) 붙잡기는 푼다.
 * 차·이어폰 버튼도 이 미디어 세션으로 받아 화면(JS)에 넘긴다.
 */
public class PlaybackService extends Service {
    private static final String CHANNEL = "playback";
    private static final int ID = 1;
    private PowerManager.WakeLock lock;
    private MediaSession session;
    private boolean foreground = false;

    @Override
    public void onCreate() {
        super.onCreate();
        session = new MediaSession(this, "onum");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { MusicScanPlugin.emit("play"); }
            @Override public void onPause() { MusicScanPlugin.emit("pause"); }
            @Override public void onStop() { MusicScanPlugin.emit("pause"); }
            @Override public void onSkipToNext() { MusicScanPlugin.emit("next"); }
            @Override public void onSkipToPrevious() { MusicScanPlugin.emit("prev"); }
            @Override public void onSeekTo(long pos) { MusicScanPlugin.emitSeek(pos); }
        });
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        session.setSessionActivity(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE));
        session.setActive(true);
    }

    private PendingIntent act(String a, int code) {
        Intent i = new Intent(this, PlaybackService.class);
        i.putExtra("act", a);
        return PendingIntent.getService(this, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification.Action button(int icon, String title, String a, int code) {
        return new Notification.Action.Builder(Icon.createWithResource(this, icon), title, act(a, code)).build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // 알림의 버튼을 누른 경우: 화면(JS)에 넘기기만 한다
        String a = intent != null ? intent.getStringExtra("act") : null;
        if (a != null) {
            MusicScanPlugin.emit(a);
            return START_NOT_STICKY;
        }

        String title = intent != null ? intent.getStringExtra("title") : null;
        String artist = intent != null ? intent.getStringExtra("artist") : null;
        boolean playing = intent == null || intent.getBooleanExtra("playing", true);
        long pos = intent != null ? intent.getLongExtra("pos", 0) : 0;
        long dur = intent != null ? intent.getLongExtra("dur", 0) : 0;
        float rate = intent != null ? intent.getFloatExtra("rate", 1f) : 1f;
        if (title == null) title = "온음";
        if (artist == null) artist = "";

        session.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, dur)
            .build());
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, pos, playing ? rate : 0f)
            .build());

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "재생 중", NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(playing ? android.R.drawable.ic_media_play : android.R.drawable.ic_media_pause)
            .setContentTitle(title)
            .setContentText(artist)
            .setContentIntent(session.getController().getSessionActivity())
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .setShowWhen(false)
            .addAction(button(android.R.drawable.ic_media_previous, "이전", "prev", 1))
            .addAction(playing
                ? button(android.R.drawable.ic_media_pause, "일시 정지", "pause", 2)
                : button(android.R.drawable.ic_media_play, "재생", "play", 3))
            .addAction(button(android.R.drawable.ic_media_next, "다음", "next", 4))
            .setStyle(new Notification.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        Notification n = b.build();

        // 재생 중일 때만 포그라운드(startForegroundService로 불렀으면 반드시 해야 함)
        if (playing) {
            if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(ID, n);
            foreground = true;
        }

        if (lock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "onum:playback");
            lock.setReferenceCounted(false);
        }
        if (playing) {
            if (!lock.isHeld()) lock.acquire(6 * 60 * 60 * 1000L);
        } else {
            // 멈추면 붙잡기를 풀고, 알림은 남겨 둔다(밀어서 지울 수 있음)
            if (lock.isHeld()) lock.release();
            if (foreground) { stopForeground(Service.STOP_FOREGROUND_DETACH); foreground = false; }
            nm.notify(ID, n);
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (lock != null && lock.isHeld()) lock.release();
        if (session != null) { session.setActive(false); session.release(); }
        stopForeground(Service.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
