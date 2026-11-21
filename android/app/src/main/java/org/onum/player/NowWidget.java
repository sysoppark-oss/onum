package org.onum.player;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/**
 * 홈 화면 위젯: 맨 위에 카드 한 줄(「맑은물속교회에서 드리는 온음」), 곡 이름(두 줄까지)·가수, 이전·재생·다음.
 * 재생 상태는 PlaybackService가 알려 줄 때마다 저장해 두고 그린다(휴대폰을 다시 켜도 마지막 곡이 보인다).
 * 앱이 열려 있으면 버튼을 화면(JS)에 넘기고, 닫혀 있으면 앱을 연다.
 */
public class NowWidget extends AppWidgetProvider {
    static final String ACT = "org.onum.player.WIDGET_ACT";
    private static final String PREF = "onum_now";

    /** PlaybackService가 부른다: 지금 상태를 적어 두고 위젯을 다시 그린다 */
    static void save(Context c, String title, String artist, String brand, boolean playing) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit()
            .putString("title", title).putString("artist", artist).putString("brand", brand)
            .putBoolean("playing", playing).apply();
        update(c);
    }

    /** 재생을 끝냈을 때: 곡은 남겨 두고 멈춤으로 */
    static void stopped(Context c) {
        c.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putBoolean("playing", false).apply();
        update(c);
    }

    static void update(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, NowWidget.class));
        if (ids == null || ids.length == 0) return;
        m.updateAppWidget(ids, views(c));
    }

    private static RemoteViews views(Context c) {
        SharedPreferences p = c.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String title = p.getString("title", null);
        String artist = p.getString("artist", "");
        String brand = p.getString("brand", "");
        boolean playing = p.getBoolean("playing", false);
        boolean alive = MusicScanPlugin.inst != null;

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_now);
        v.setTextViewText(R.id.w_brand, brand == null || brand.isEmpty() ? c.getString(R.string.w_idle) : brand);
        v.setTextViewText(R.id.w_title, title == null || title.isEmpty() ? c.getString(R.string.w_idle2) : title);
        v.setTextViewText(R.id.w_artist, artist == null ? "" : artist);
        v.setImageViewResource(R.id.w_play, playing ? R.drawable.w_pause : R.drawable.w_play);
        v.setContentDescription(R.id.w_play, c.getString(playing ? R.string.w_pause : R.string.w_play));

        PendingIntent open = openApp(c, 10);
        v.setOnClickPendingIntent(R.id.w_root, open);
        if (alive && title != null) {
            v.setOnClickPendingIntent(R.id.w_prev, act(c, "prev", 11));
            v.setOnClickPendingIntent(R.id.w_play, act(c, playing ? "pause" : "play", 12));
            v.setOnClickPendingIntent(R.id.w_next, act(c, "next", 13));
        } else {
            // 앱이 닫혀 있으면 어느 버튼이든 앱을 연다(곡을 고르고 이어 듣기)
            v.setOnClickPendingIntent(R.id.w_prev, open);
            v.setOnClickPendingIntent(R.id.w_play, open);
            v.setOnClickPendingIntent(R.id.w_next, open);
        }
        return v;
    }

    private static PendingIntent openApp(Context c, int code) {
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent act(Context c, String a, int code) {
        Intent i = new Intent(c, NowWidget.class);
        i.setAction(ACT);
        i.putExtra("act", a);
        return PendingIntent.getBroadcast(c, code, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (ACT.equals(intent.getAction())) {
            String a = intent.getStringExtra("act");
            if (a != null && MusicScanPlugin.inst != null) MusicScanPlugin.emit(a);
            else {
                // 앱이 그새 닫혔다: 위젯을 「앱 열기」 모양으로 바꾸고 앱을 연다
                update(c);
                try {
                    Intent i = new Intent(c, MainActivity.class);
                    i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                    c.startActivity(i);
                } catch (Exception ignored) { }
            }
            return;
        }
        super.onReceive(c, intent);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        m.updateAppWidget(ids, views(c));
    }
}
