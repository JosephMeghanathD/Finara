package com.finara.config;

import java.util.LinkedHashMap;
import java.util.Map;

public final class TimingContext {
    private TimingContext() {}

    private static final ThreadLocal<State> LOCAL = ThreadLocal.withInitial(State::new);

    private static class State {
        final long startMs = System.currentTimeMillis();
        final Map<String, Long> segments = new LinkedHashMap<>();
    }

    public static void start() {
        LOCAL.set(new State());
    }

    /** Accumulate a named segment (adds to existing total if called multiple times). */
    public static void record(String key, long ms) {
        LOCAL.get().segments.merge(key, ms, Long::sum);
    }

    /**
     * Extract timing from a Python ML-service response and record the relevant segments.
     * Also records the Java-side round-trip under "ml_ms".
     */
    @SuppressWarnings("unchecked")
    public static void recordMlResponse(Map<?, ?> resp, long roundTripMs) {
        record("ml_ms", roundTripMs);
        if (resp == null) return;
        Object t = resp.get("timing");
        if (!(t instanceof Map)) return;
        Map<String, Object> timing = (Map<String, Object>) t;
        Number gemmaMs = (Number) timing.get("gemma_ms");
        if (gemmaMs != null) record("gemma_ms", gemmaMs.longValue());
        Number pythonMs = (Number) timing.get("total_ms");
        if (pythonMs != null) record("ml_python_ms", pythonMs.longValue());
    }

    /** Build the response timing map, adding total_ms from when start() was called. */
    public static Map<String, Object> build() {
        State s = LOCAL.get();
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("total_ms", System.currentTimeMillis() - s.startMs);
        s.segments.forEach(m::put);
        return m;
    }

    public static void clear() {
        LOCAL.remove();
    }
}
