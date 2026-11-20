package org.onum.player;

import java.util.ArrayList;
import java.util.Arrays;

/**
 * 강의 속 조용한 구간 찾기(웹 쪽 quiet.ts와 같은 셈).
 * 창마다 크기(dB)에서 바닥(하위 10%)과 말소리(상위 30%)를 잡고, 그 사이 35% 지점보다 작으면 조용함.
 * 0.7초 넘게 이어지면 앞뒤 0.15초씩 남기고 구간으로 낸다. 결과는 1/100초 단위 [시작, 끝, 시작, 끝, …].
 */
final class Quiet {
    private Quiet() {}

    static int[] find(float[] lv, int winMs) {
        int n = lv.length;
        if (n < 40) return new int[0];
        float[] s = Arrays.copyOf(lv, n);
        Arrays.sort(s);
        float floor = s[(int) (n * 0.10)];
        float speech = s[(int) (n * 0.70)];
        if (speech - floor < 10) return new int[0]; // 말과 쉼이 잘 갈리지 않는 녹음은 건드리지 않는다
        float thr = Math.min(floor + 0.35f * (speech - floor), speech - 12);
        int minWins = 700 / winMs, keep = 150 / winMs;
        ArrayList<Integer> out = new ArrayList<>();
        int i = 0;
        while (i < n) {
            if (lv[i] >= thr) { i++; continue; }
            int j = i;
            while (j < n && lv[j] < thr) j++;
            if (j - i >= minWins) {
                int a = i + keep, b = j - keep;
                if (b - a >= 2) { out.add(a * winMs / 10); out.add(b * winMs / 10); }
            }
            i = j;
        }
        int[] r = new int[out.size()];
        for (int k = 0; k < r.length; k++) r[k] = out.get(k);
        return r;
    }
}
