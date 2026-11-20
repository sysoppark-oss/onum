package org.onum.player;

import java.util.ArrayList;

/** BS.1770 방식 소리 크기. 표본 조각들을 받아 K-가중 400ms 블록 에너지를 모은다. (안드로이드 없이도 시험할 수 있게 따로 둔다) */
public class Loudness {
    private final double[] shelf, hp;
    private final int block, step;
    private final ArrayList<Double> energies = new ArrayList<>();

    public Loudness(int fs) {
        shelf = biquad(true, 1500, fs, 1 / Math.sqrt(2), 4);
        hp = biquad(false, 38, fs, 0.5, 0);
        block = Math.round(fs * 0.4f);
        step = block / 4;
    }

    static double[] biquad(boolean isShelf, double fc, double fs, double q, double gainDb) {
        double A = Math.pow(10, gainDb / 40), w = 2 * Math.PI * fc / fs, c = Math.cos(w), al = Math.sin(w) / (2 * q);
        double b0, b1, b2, a0, a1, a2;
        if (isShelf) {
            double r = 2 * Math.sqrt(A) * al;
            b0 = A * ((A + 1) + (A - 1) * c + r); b1 = -2 * A * ((A - 1) + (A + 1) * c); b2 = A * ((A + 1) + (A - 1) * c - r);
            a0 = (A + 1) - (A - 1) * c + r; a1 = 2 * ((A - 1) - (A + 1) * c); a2 = (A + 1) - (A - 1) * c - r;
        } else {
            b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al;
        }
        return new double[] { b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0 };
    }

    static double[] filter(double[] x, double[] k) {
        double[] y = new double[x.length];
        double x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (int i = 0; i < x.length; i++) {
            double v = k[0] * x[i] + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2;
            x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
        }
        return y;
    }

    /** 한 조각(채널별 표본). 필터가 자리 잡도록 앞 skip개는 버린다. */
    public void add(double[][] chs, int skip) {
        double[][] k = new double[Math.min(2, chs.length)][];
        for (int c = 0; c < k.length; c++) k[c] = filter(filter(chs[c], shelf), hp);
        int n = k[0].length;
        for (int i = skip; i + block <= n; i += step) {
            double sum = 0;
            for (double[] ch : k) { double e = 0; for (int j = i; j < i + block; j++) e += ch[j] * ch[j]; sum += e / block; }
            energies.add(sum);
        }
    }

    static double lk(double e) { return -0.691 + 10 * Math.log10(e); }

    /** 통합 소리 크기(LUFS). 잴 수 없으면 NaN */
    public double integrated() {
        ArrayList<Double> abs = new ArrayList<>();
        for (double e : energies) if (e > 0 && lk(e) > -70) abs.add(e);
        if (abs.isEmpty()) return Double.NaN;
        double m = 0; for (double e : abs) m += e; m /= abs.size();
        double rel = lk(m) - 10;
        double g = 0; int n = 0;
        for (double e : abs) if (lk(e) > rel) { g += e; n++; }
        return n == 0 ? Double.NaN : Math.round(lk(g / n) * 10) / 10.0;
    }
}
