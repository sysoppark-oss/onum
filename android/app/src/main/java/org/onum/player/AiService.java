package org.onum.player;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * 노래연습 AI 반주를 만드는 동안 알림줄에 진행률을 띄운다.
 * 포그라운드 서비스라서 다른 메뉴로 가거나 화면이 꺼져도 안드로이드가 계산을 끊지 않는다.
 * 계산 자체는 MusicScanPlugin의 스레드가 하고, 이 서비스는 알림과 CPU 깨움만 맡는다.
 */
public class AiService extends Service {
    static final String CHANNEL = "onum_ai";
    static final int ID = 4210, DONE_ID = 4211;
    private static String title = "";
    private static int pct = 0;
    private PowerManager.WakeLock lock;

    static void start(Context c, String t) {
        title = t == null ? "" : t; pct = 0;
        Intent i = new Intent(c, AiService.class);
        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    static void progress(Context c, int p) {
        if (p == pct) return;
        pct = p;
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        try { nm.notify(ID, build(c)); } catch (Exception ignored) { }
    }

    /** 끝: done이 있으면 「다 만들었어요」 알림을 따로 남긴다 */
    static void finish(Context c, String done) {
        c.stopService(new Intent(c, AiService.class));
        if (done == null || done.isEmpty()) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        Notification.Builder b = builder(c).setContentTitle(done).setAutoCancel(true);
        try { nm.notify(DONE_ID, b.build()); } catch (Exception ignored) { }
    }

    private static Notification.Builder builder(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, c.getString(R.string.n_ai_channel), NotificationManager.IMPORTANCE_LOW);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open != null) {
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            b.setContentIntent(PendingIntent.getActivity(c, 7, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
        }
        b.setSmallIcon(R.drawable.ic_stat_onum).setShowWhen(false);
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        return b;
    }

    private static Notification build(Context c) {
        return builder(c).setContentTitle(title).setContentText(pct + "%")
            .setProgress(100, pct, false).setOngoing(true).setOnlyAlertOnce(true).build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification n = build(this);
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(ID, n);
        if (lock == null) {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "onum:ai");
            lock.setReferenceCounted(false);
            lock.acquire(60 * 60 * 1000L); // 한 시간이 넘으면 놓는다
        }
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        if (lock != null && lock.isHeld()) lock.release();
        lock = null;
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
