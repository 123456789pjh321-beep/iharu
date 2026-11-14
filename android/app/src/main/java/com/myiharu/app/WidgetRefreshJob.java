package com.myiharu.app;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.json.JSONException;
import org.json.JSONObject;

public final class WidgetRefreshJob extends JobService {
    private static final int UPDATE = 9131, PERIODIC = 9132, DISPLAY = 9133;
    static final long MAX_AGE = TimeUnit.MINUTES.toMillis(45);
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Map<Integer, JobParameters> running = new HashMap<>();

    static void refresh(Context context) {
        schedule(context, UPDATE, true, 0, 0);
    }

    static void periodic(Context context) {
        if (!ScheduleWidgetProvider.hasWidgets(context)) return;
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        if (scheduler.getPendingJob(PERIODIC) == null) schedule(context, PERIODIC, true, TimeUnit.MINUTES.toMillis(30), 0);
    }

    static void expireDisplay(Context context, long at) {
        schedule(context, DISPLAY, false, 0, Math.max(1000, at + MAX_AGE - System.currentTimeMillis()));
    }

    private static void schedule(Context context, int id, boolean network, long period, long delay) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        JobInfo.Builder builder = new JobInfo.Builder(id, new ComponentName(context, WidgetRefreshJob.class));
        if (network) builder.setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY);
        if (period > 0) builder.setPeriodic(period);
        if (delay > 0) builder.setMinimumLatency(delay);
        scheduler.schedule(builder.build());
    }

    static void cancel(Context context) {
        JobScheduler scheduler = context.getSystemService(JobScheduler.class);
        scheduler.cancel(UPDATE);
        scheduler.cancel(PERIODIC);
        scheduler.cancel(DISPLAY);
    }

    @Override public boolean onStartJob(JobParameters params) {
        if (params.getJobId() == DISPLAY) {
            ScheduleWidgetProvider.renderAll(this);
            return false;
        }
        SharedPreferences prefs = WidgetConnection.preferences(this);
        String grant = prefs.getString("grant", null), verifier = prefs.getString("verifier", null);
        if (grant == null || verifier == null || !ScheduleWidgetProvider.hasWidgets(this)) return false;
        running.put(params.getJobId(), params);
        worker.execute(() -> {
            String snapshot = null;
            boolean rejected = false;
            try {
                snapshot = fetch(grant, verifier);
                rejected = snapshot == null;
            } catch (IOException offline) {
                // Keep the last response only while the display's freshness window remains open.
            }
            String received = snapshot;
            boolean unauthorized = rejected;
            main.post(() -> {
                if (running.get(params.getJobId()) != params) return;
                running.remove(params.getJobId());
                boolean current = grant.equals(prefs.getString("grant", null));
                if (current) {
                    if (unauthorized) WidgetConnection.clear(this);
                    else if (received != null) prefs.edit().putString("snapshot", received)
                            .putLong("fetched_at", System.currentTimeMillis()).apply();
                    ScheduleWidgetProvider.renderAll(this);
                }
                jobFinished(params, false);
                if (current && unauthorized) cancel(this);
            });
        });
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) {
        running.remove(params.getJobId());
        return params.getJobId() == UPDATE;
    }

    @Override public void onDestroy() {
        running.clear();
        worker.shutdownNow();
        super.onDestroy();
    }

    static String fetch(String grant, String verifier) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(
                WidgetConnection.ORIGIN + "/api/v1/android-widget/snapshot").openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setConnectTimeout(8000);
        connection.setReadTimeout(8000);
        connection.setRequestProperty("Authorization", "Bearer " + grant);
        connection.setRequestProperty("X-Iharu-Widget-Key", verifier);
        try {
            int code = connection.getResponseCode();
            if (code == 401 || code == 403) return null;
            if (code != 200) throw new IOException("Widget refresh unavailable");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096];
                for (int count; (count = input.read(buffer)) != -1;) {
                    if (bytes.size() + count > 32768) throw new IOException("Widget snapshot too large");
                    bytes.write(buffer, 0, count);
                }
                String data = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
                JSONObject parsed = new JSONObject(data);
                if (parsed.getJSONArray("calendar").length() != 42 || parsed.getJSONArray("timetable").length() != 7
                        || !parsed.getString("today").matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) {
                    throw new IOException("Invalid widget snapshot");
                }
                return data;
            } catch (JSONException invalid) {
                throw new IOException("Invalid widget snapshot", invalid);
            }
        } finally {
            connection.disconnect();
        }
    }
}
