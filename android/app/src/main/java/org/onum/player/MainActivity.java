package org.onum.player;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MusicScanPlugin.class);
        super.onCreate(savedInstanceState);
        // 글자 크기는 화면이 직접 맞춘다(휴대폰 설정 배율을 읽어 rem에 반영). 이중으로 커지지 않게 100%로 고정.
        getBridge().getWebView().getSettings().setTextZoom(100);
    }
}
