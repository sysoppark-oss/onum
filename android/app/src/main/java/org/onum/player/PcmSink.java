package org.onum.player;

/** 풀어낸 44.1kHz 스테레오 표본을 받는 곳 */
interface PcmSink { void put(float l, float r); }
