package org.onum.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
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
    private String artKey = "";
    private Bitmap art;

    /* ───────── 오디오 포커스 ─────────
       화면(WebView)은 스스로 포커스를 잡지 않는다. 그래서 여기서 잡는다.
       - 문자·카톡 같은 알림 소리(줄여도 되는 잠깐): 음악을 줄이지 않는다(setWillPauseWhenDucked + 무시)
       - 전화·알람·길 안내처럼 잠깐 소리를 가져가면: 멈췄다가 끝나면 다시 튼다
       - 다른 음악 앱이 재생을 시작하면: 멈춘다(안드로이드 12부터는 시스템이 어차피 소리를 줄여 버린다) */
    private AudioManager am;
    private AudioFocusRequest focusReq;
    private boolean hasFocus = false;
    private boolean pausedByFocus = false;
    private final AudioManager.OnAudioFocusChangeListener focusListener = change -> {
        switch (change) {
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                break; // 알림 소리: 그대로 둔다
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                pausedByFocus = true;
                MusicScanPlugin.emit("pause");
                break;
            case AudioManager.AUDIOFOCUS_LOSS:
                pausedByFocus = false;
                MusicScanPlugin.emit("pause");
                abandonFocus();
                break;
            case AudioManager.AUDIOFOCUS_GAIN:
                if (pausedByFocus) { pausedByFocus = false; MusicScanPlugin.emit("play"); }
                break;
        }
    };

    @SuppressWarnings("deprecation")
    private void requestFocus() {
        if (hasFocus) return;
        if (am == null) am = (AudioManager) getSystemService(AUDIO_SERVICE);
        int r;
        if (Build.VERSION.SDK_INT >= 26) {
            if (focusReq == null) {
                focusReq = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                    .setWillPauseWhenDucked(true) // 시스템이 알아서 줄이지 않게(우리가 무시한다)
                    .setOnAudioFocusChangeListener(focusListener)
                    .build();
            }
            r = am.requestAudioFocus(focusReq);
        } else {
            r = am.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN);
        }
        hasFocus = r == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }

    @SuppressWarnings("deprecation")
    private void abandonFocus() {
        if (!hasFocus || am == null) return;
        if (Build.VERSION.SDK_INT >= 26 && focusReq != null) am.abandonAudioFocusRequest(focusReq);
        else am.abandonAudioFocus(focusListener);
        hasFocus = false;
    }

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
        String brand = intent != null ? intent.getStringExtra("brand") : null;
        if (title == null) title = "온음";
        if (artist == null) artist = "";
        if (brand == null) brand = "";
        NowWidget.save(this, title, artist, brand, playing);
        // 재생하면 포커스를 잡고, 사람이 멈추면 놓는다(전화 등으로 잠깐 멈춘 때는 끝나고 다시 틀도록 붙잡아 둔다)
        if (playing) { pausedByFocus = false; requestFocus(); }
        else if (!pausedByFocus) abandonFocus();

        session.setMetadata(new MediaMetadata.Builder()
            .putString(MediaMetadata.METADATA_KEY_TITLE, title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
            .putLong(MediaMetadata.METADATA_KEY_DURATION, dur)
            .putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, artFor(title, artist, brand))
            .build());
        session.setPlaybackState(new PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE
                | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, pos, playing ? rate : 0f)
            .build());

        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, getString(R.string.n_channel), NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_stat_onum)
            .setContentTitle(title)
            .setContentText(artist)
            .setSubText(brand.isEmpty() ? null : brand)
            .setLargeIcon(artFor(title, artist, brand))
            .setContentIntent(session.getController().getSessionActivity())
            .setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOngoing(playing)
            .setShowWhen(false)
            .addAction(button(R.drawable.n_prev, getString(R.string.w_prev), "prev", 1))
            .addAction(playing
                ? button(R.drawable.n_pause, getString(R.string.w_pause), "pause", 2)
                : button(R.drawable.n_play, getString(R.string.w_play), "play", 3))
            .addAction(button(R.drawable.n_next, getString(R.string.w_next), "next", 4))
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

    /**
     * 잠금 화면·알림의 그림: 앨범 그림 대신 곡 이름(세 줄까지)과 가수를 온음 글꼴 느낌으로.
     * 위에는 카드 한 줄(「맑은물속교회에서 드리는 온음」), 없으면 「온음」. 같은 곡이면 다시 그리지 않는다.
     */
    private Bitmap artFor(String title, String artist, String brand) {
        String key = title + "\u0001" + artist + "\u0001" + brand;
        if (art != null && key.equals(artKey)) return art;
        final int S = 720, PAD = 64, W = S - PAD * 2;
        Bitmap b = Bitmap.createBitmap(S, S, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        c.drawColor(0xFF111316);
        Typeface bold = Typeface.create("sans-serif", Typeface.BOLD);
        Typeface reg = Typeface.create("sans-serif", Typeface.NORMAL);

        TextPaint top = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        top.setColor(0xFF9BA1A9); top.setTextSize(34); top.setTypeface(bold);
        String head = brand.isEmpty() ? "온음" : brand;
        c.drawText(TextUtils.ellipsize(head, top, W, TextUtils.TruncateAt.END).toString(), PAD, PAD + 34, top);

        TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        tp.setColor(0xFFEDEEF0); tp.setTypeface(bold); tp.setLetterSpacing(-0.03f);
        // 긴 이름은 조금 작게: 세 줄 안에 들도록
        StaticLayout tl = null;
        for (int size = 76; size >= 48; size -= 4) {
            tp.setTextSize(size);
            tl = StaticLayout.Builder.obtain(title, 0, title.length(), tp, W)
                .setLineSpacing(0, 1.12f).setMaxLines(3).setEllipsize(TextUtils.TruncateAt.END)
                .setAlignment(Layout.Alignment.ALIGN_NORMAL).build();
            if (tl.getLineCount() < 3 || tl.getEllipsisCount(2) == 0) break;
        }
        TextPaint ap = new TextPaint(Paint.ANTI_ALIAS_FLAG);
        ap.setColor(0xFF9BA1A9); ap.setTextSize(38); ap.setTypeface(reg);
        String a = TextUtils.ellipsize(artist, ap, W, TextUtils.TruncateAt.END).toString();

        int ah = artist.isEmpty() ? 0 : 38 + 20;
        int y = S - PAD - ah - (tl != null ? tl.getHeight() : 0);
        if (tl != null) { c.save(); c.translate(PAD, y); tl.draw(c); c.restore(); }
        if (!artist.isEmpty()) c.drawText(a, PAD, S - PAD - 8, ap);

        art = b; artKey = key;
        return b;
    }

    @Override
    public void onDestroy() {
        pausedByFocus = false;
        abandonFocus();
        NowWidget.stopped(this);
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
