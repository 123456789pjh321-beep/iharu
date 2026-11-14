package com.myiharu.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.concurrent.TimeUnit;

final class WidgetConnection {
    private static final long LINK_WINDOW = TimeUnit.MINUTES.toMillis(15);
    static final String ORIGIN = "https://myiharu.com";
    static final String SETTINGS_PATH = "/android/widgets";

    static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("iharu_widgets", Context.MODE_PRIVATE);
    }

    static String start(Context context, int widgetId) {
        byte[] randomness = new byte[32];
        new SecureRandom().nextBytes(randomness);
        String verifier = encode(randomness);
        preferences(context).edit().putString("pending_verifier", verifier)
                .putInt("pending_id", widgetId).putLong("pending_until", System.currentTimeMillis() + LINK_WINDOW).apply();
        try {
            return encode(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static String encode(byte[] value) {
        return Base64.encodeToString(value, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    static void clear(Context context) {
        preferences(context).edit().clear().apply();
    }
}
