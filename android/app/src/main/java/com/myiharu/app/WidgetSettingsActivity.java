package com.myiharu.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class WidgetSettingsActivity extends Activity {
    private static final ExecutorService LINKS = Executors.newSingleThreadExecutor();
    private int widgetId;
    private boolean returningGrant;
    private TextView status;
    private boolean pendingUpdate;
    private Button finishSetup;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent incoming = getIntent();
        widgetId = incoming.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (AppWidgetManager.ACTION_APPWIDGET_CONFIGURE.equals(incoming.getAction())) setResult(RESULT_CANCELED);
        buildScreen();
        Uri uri = incoming.getData();
        if (Intent.ACTION_VIEW.equals(incoming.getAction()) && uri != null
                && "iharu-widget".equals(uri.getScheme()) && "connect".equals(uri.getHost())) {
            returningGrant = true;
            receiveGrant(incoming.getStringExtra("grant"));
        } else if (!AppWidgetManager.ACTION_APPWIDGET_CONFIGURE.equals(incoming.getAction()) || !validWidget(widgetId)) {
            finish();
        }
    }

    private boolean validWidget(int id) {
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) return false;
        var provider = AppWidgetManager.getInstance(this).getAppWidgetInfo(id);
        return provider != null && (provider.provider.equals(new ComponentName(this, CalendarWidget.class))
                || provider.provider.equals(new ComponentName(this, TimetableWidget.class)));
    }

    private void buildScreen() {
        LinearLayout screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        int padding = Math.round(24 * getResources().getDisplayMetrics().density);
        screen.setPadding(padding, padding, padding, padding);
        TextView heading = new TextView(this);
        heading.setText(R.string.widget_settings);
        heading.setTextSize(24);
        screen.addView(heading);
        status = new TextView(this);
        status.setText("아이하루에 로그인하면 달력과 시간표를 홈 화면에서 볼 수 있어요.");
        screen.addView(status);
        Button connect = new Button(this);
        connect.setText("아이하루에 연결");
        connect.setOnClickListener(view -> {
            if (pendingUpdate || !validWidget(widgetId)) return;
            String challenge = WidgetConnection.start(this, widgetId);
            Uri url = Uri.parse(WidgetConnection.ORIGIN + WidgetConnection.SETTINGS_PATH + "?challenge=" + challenge);
            startActivity(new Intent(Intent.ACTION_VIEW, url, this, MainActivity.class));
        });
        screen.addView(connect);
        finishSetup = new Button(this);
        finishSetup.setText("위젯 사용");
        finishSetup.setOnClickListener(view -> finishConfiguration());
        screen.addView(finishSetup);
        finishSetup.setEnabled(WidgetConnection.preferences(this).contains("grant"));
        if (WidgetConnection.preferences(this).contains("grant")) {
            Button disconnect = new Button(this);
            disconnect.setText("위젯 연결 끊기");
            disconnect.setOnClickListener(view -> {
                WidgetConnection.clear(this);
                ScheduleWidgetProvider.renderAll(this);
                WidgetRefreshJob.cancel(this);
                finish();
            });
            screen.addView(disconnect);
        }
        setContentView(screen);
    }

    private void finishConfiguration() {
        if (pendingUpdate || !validWidget(widgetId)) return;
        ScheduleWidgetProvider.renderAll(this);
        WidgetRefreshJob.refresh(this);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }

    private void receiveGrant(String grant) {
        ContextHolder state = new ContextHolder(WidgetConnection.preferences(this));
        widgetId = state.widgetId;
        if (!validWidget(widgetId) || state.verifier == null || state.until <= System.currentTimeMillis()
                || grant == null || !grant.matches("[A-Za-z0-9_-]{60,700}")) {
            status.setText("위젯에서 연결을 다시 시작해 주세요.");
            return;
        }
        pendingUpdate = true;
        status.setText("위젯을 연결하고 있어요.");
        LINKS.execute(() -> {
            String snapshot;
            try { snapshot = WidgetRefreshJob.fetch(grant, state.verifier); }
            catch (IOException failure) { snapshot = null; }
            String result = snapshot;
            runOnUiThread(() -> {
                pendingUpdate = false;
                if (isFinishing() || isDestroyed()) return;
                SharedPreferences prefs = WidgetConnection.preferences(this);
                if (result == null || !validWidget(widgetId) || !state.verifier.equals(prefs.getString("pending_verifier", null))
                        || state.until <= System.currentTimeMillis()) {
                    status.setText("연결하지 못했어요. 위젯에서 다시 시도해 주세요.");
                    return;
                }
                prefs.edit().putString("grant", grant).putString("verifier", state.verifier)
                        .remove("pending_verifier").remove("pending_until").remove("pending_id")
                        .putString("snapshot", result).putLong("fetched_at", System.currentTimeMillis()).apply();
                ScheduleWidgetProvider.renderAll(this);
                WidgetRefreshJob.periodic(this);
                finish();
            });
        });
    }

    @Override protected void onResume() {
        super.onResume();
        if (!returningGrant && !pendingUpdate && WidgetConnection.preferences(this).contains("grant")) {
            status.setText("연결된 계정의 일정을 표시할 준비가 됐어요.");
            finishSetup.setEnabled(true);
        }
    }

    private static final class ContextHolder {
        final int widgetId;
        final String verifier;
        final long until;

        ContextHolder(SharedPreferences preferences) {
            widgetId = preferences.getInt("pending_id", AppWidgetManager.INVALID_APPWIDGET_ID);
            verifier = preferences.getString("pending_verifier", null);
            until = preferences.getLong("pending_until", 0);
        }
    }
}
