package com.myiharu.app;

import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;
import androidx.browser.customtabs.CustomTabsCallback;

/** A network/browser quality failure must not deliberately crash the Android host process. */
final class RecoverableTabsCallback extends CustomTabsCallback {
    private final Runnable notifyFailure;
    private final Handler main = new Handler(Looper.getMainLooper());
    private boolean notified;

    RecoverableTabsCallback(Context context) {
        Context application = context.getApplicationContext();
        notifyFailure = () -> Toast.makeText(application,
            "연결이 중단됐어요. 연결 상태를 확인한 후 다시 시도해 주세요.", Toast.LENGTH_LONG).show();
    }

    RecoverableTabsCallback(Runnable notifyFailure) {
        this.notifyFailure = notifyFailure;
    }

    private void reportFailure() {
        main.post(() -> {
            // Never retain an Activity or log the browser's reason/URL (may contain auth data).
            if (notified) return;
            notified = true;
            Log.w("IharuConnection", "Browser navigation failed; showing recoverable connection guidance");
            notifyFailure.run();
        });
    }

    @Override
    public void onNavigationEvent(int event, Bundle extras) {
        if (event == NAVIGATION_FAILED) reportFailure();
        if (event == NAVIGATION_FINISHED) main.post(() -> notified = false);
    }

    @Override
    public Bundle extraCallbackWithResult(String name, Bundle args) {
        if ("quality_enforcement.crash".equals(name)) reportFailure();
        // Do not use QualityEnforcer: it schedules an uncaught RuntimeException on the main thread.
        // The browser error page / service worker supplies retry UI; do not claim a crash succeeded.
        return Bundle.EMPTY;
    }
}
