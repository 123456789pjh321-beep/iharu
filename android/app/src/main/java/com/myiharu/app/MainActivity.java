package com.myiharu.app;

import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.browser.customtabs.CustomTabsCallback;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Own-origin links only, recoverable connection failures, no automatic retry loop. */
public final class MainActivity extends LauncherActivity {
    private boolean launchInProgress;

    @Override
    protected void onCreate(Bundle state) {
        setIntent(sanitizeIntent(this, getIntent()));
        super.onCreate(state);
        if (!isFinishing() && !hasNetworkConnection()) showConnectionMessage(false);
    }

    static Intent sanitizeIntent(Context context, Intent incoming) {
        Intent clean = new Intent(context, MainActivity.class);
        clean.setAction(incoming == null ? Intent.ACTION_MAIN : incoming.getAction());
        if (incoming == null) return clean;
        // Preserve task/launcher semantics, but never forward URI grants, ClipData or extras.
        clean.setFlags(incoming.getFlags() & ~(Intent.FLAG_GRANT_READ_URI_PERMISSION
            | Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
            | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION));
        if (incoming.getCategories() != null) {
            for (String category : incoming.getCategories()) clean.addCategory(category);
        }
        Uri url = incoming.getData();
        // A launcher tap has no URL. Keep it that way so ABH can resume an existing TWA.
        if (url == null) return clean;
        boolean ownOrigin = "https".equalsIgnoreCase(url.getScheme())
            && "myiharu.com".equalsIgnoreCase(url.getHost())
            && (url.getPort() == -1 || url.getPort() == 443)
            && url.getUserInfo() == null;
        clean.setData(ownOrigin ? url : Uri.parse("https://myiharu.com/timetable"));
        return clean;
    }

    @Override
    protected boolean shouldLaunchImmediately() {
        return hasNetworkConnection();
    }

    private boolean hasNetworkConnection() {
        ConnectivityManager manager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    @Override
    protected void launchTwa() {
        if (launchInProgress || isFinishing() || isDestroyed()) return;
        if (!hasNetworkConnection()) {
            showConnectionMessage(false);
            return;
        }
        launchInProgress = true;
        try {
            super.launchTwa();
        } catch (ActivityNotFoundException | SecurityException unavailable) {
            // Browser can disappear or be disabled between provider discovery and launching it.
            launchInProgress = false;
            android.util.Log.w("IharuConnection", "Browser launch unavailable");
            if (!isFinishing() && !isDestroyed()) showConnectionMessage(true);
        }
    }

    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        return new RecoverableTabsCallback(getApplicationContext());
    }

    private void showConnectionMessage(boolean browserUnavailable) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER_VERTICAL);
        panel.setBackgroundColor(0xfff3f7fc);
        int space = Math.round(24 * getResources().getDisplayMetrics().density);
        panel.setPadding(space, space * 2, space, space * 2);
        panel.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars());
                view.setPadding(space + bars.left, space * 2 + bars.top,
                    space + bars.right, space * 2 + bars.bottom);
            } else {
                view.setPadding(space + insets.getSystemWindowInsetLeft(), space * 2 + insets.getSystemWindowInsetTop(),
                    space + insets.getSystemWindowInsetRight(), space * 2 + insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        TextView title = new TextView(this);
        title.setText(browserUnavailable ? "브라우저를 확인해 주세요" : "인터넷 연결을 확인해 주세요");
        title.setTextSize(24);
        title.setTextColor(0xff14324b);
        title.setTypeface(null, android.graphics.Typeface.BOLD);
        panel.addView(title);
        TextView description = new TextView(this);
        description.setText(browserUnavailable
            ? "Chrome 등 지원되는 브라우저를 설치하거나 다시 활성화한 후 연결해 주세요."
            : "Wi-Fi 또는 모바일 데이터를 켠 후 다시 연결해 주세요. 저장된 일정은 연결 후 확인할 수 있어요.");
        description.setTextSize(17);
        description.setTextColor(0xff587088);
        description.setPadding(0, space, 0, space);
        panel.addView(description);
        Button retry = new Button(this);
        retry.setText("다시 연결");
        retry.setOnClickListener(view -> launchTwa());
        panel.addView(retry);
        Button close = new Button(this);
        close.setText("닫기");
        close.setOnClickListener(view -> finish());
        panel.addView(close);
        setContentView(panel);
        panel.requestApplyInsets();
    }
}
