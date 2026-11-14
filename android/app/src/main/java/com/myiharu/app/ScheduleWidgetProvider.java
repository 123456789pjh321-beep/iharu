package com.myiharu.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;
import android.view.View;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

abstract class ScheduleWidgetProvider extends AppWidgetProvider {
    private static final String REFRESH = "com.myiharu.app.REFRESH_WIDGET";
    private static final String[] WEEKDAYS = {"일", "월", "화", "수", "목", "금", "토"};
    private static final int INK = Color.rgb(20, 50, 75);
    private static final int BLUE = Color.rgb(8, 112, 188);

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        renderAll(context);
        WidgetRefreshJob.periodic(context);
        WidgetRefreshJob.refresh(context);
    }

    @Override public void onDeleted(Context context, int[] ids) {
        if (!hasWidgets(context)) {
            WidgetConnection.clear(context);
            WidgetRefreshJob.cancel(context);
        }
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (REFRESH.equals(intent.getAction())) {
            renderAll(context);
            WidgetRefreshJob.refresh(context);
            WidgetRefreshJob.periodic(context);
        }
    }

    static boolean hasWidgets(Context context) {
        return ids(context, CalendarWidget.class).length > 0 || ids(context, TimetableWidget.class).length > 0;
    }

    private static int[] ids(Context context, Class<?> provider) {
        return AppWidgetManager.getInstance(context).getAppWidgetIds(new ComponentName(context, provider));
    }

    static void renderAll(Context context) {
        SharedPreferences prefs = WidgetConnection.preferences(context);
        long stored = prefs.getLong("fetched_at", 0), age = System.currentTimeMillis() - stored;
        JSONObject data = null;
        if (age >= 0 && age < WidgetRefreshJob.MAX_AGE && prefs.contains("snapshot")) {
            try { data = new JSONObject(prefs.getString("snapshot", "")); }
            catch (JSONException invalid) { /* Wait for a valid refresh. */ }
        }
        render(context, CalendarWidget.class, data, prefs.contains("grant"));
        render(context, TimetableWidget.class, data, prefs.contains("grant"));
        if (data != null && hasWidgets(context)) WidgetRefreshJob.expireDisplay(context, stored);
        else if (data == null && prefs.contains("snapshot")) prefs.edit().remove("snapshot").remove("fetched_at").apply();
    }

    private static void render(Context context, Class<?> provider, JSONObject data, boolean connected) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        boolean calendar = provider == CalendarWidget.class;
        String pkg = context.getPackageName();
        for (int id : ids(context, provider)) {
            RemoteViews view = new RemoteViews(pkg, R.layout.schedule_widget);
            view.setTextViewText(R.id.widget_heading, calendar ? "아이하루 달력" : "아이하루 시간표");
            Intent page = new Intent(Intent.ACTION_VIEW,
                    Uri.parse(WidgetConnection.ORIGIN + (calendar ? "/today/calendar" : "/timetable")), context, MainActivity.class);
            view.setOnClickPendingIntent(R.id.widget_heading, PendingIntent.getActivity(context, id, page, PendingIntent.FLAG_IMMUTABLE));
            view.setOnClickPendingIntent(R.id.widget_rows, PendingIntent.getActivity(context, id, page, PendingIntent.FLAG_IMMUTABLE));

            Intent configure = new Intent(AppWidgetManager.ACTION_APPWIDGET_CONFIGURE)
                    .setClass(context, WidgetSettingsActivity.class)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
            PendingIntent openSettings = PendingIntent.getActivity(context, id, configure,
                    PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            view.setOnClickPendingIntent(R.id.widget_settings, openSettings);
            view.setOnClickPendingIntent(R.id.widget_status, openSettings);

            Intent refresh = new Intent(REFRESH).setClass(context, provider);
            view.setOnClickPendingIntent(R.id.widget_refresh, PendingIntent.getBroadcast(context, id, refresh, PendingIntent.FLAG_IMMUTABLE));
            if (data == null) {
                view.setTextViewText(R.id.widget_status, connected ? "새 일정을 기다리고 있어요" : "위젯 설정에서 계정을 연결해 주세요");
                view.setViewVisibility(R.id.widget_status, View.VISIBLE);
            } else {
                view.setViewVisibility(R.id.widget_status, View.GONE);
                String today = data.optString("today");
                if (calendar) {
                    view.setTextViewText(R.id.widget_heading, today.substring(0, 4) + "년 "
                            + Integer.parseInt(today.substring(5, 7)) + "월");
                    fillCalendar(pkg, view, data.optJSONArray("calendar"), today);
                } else {
                    fillTimetable(pkg, view, data.optJSONArray("timetable"), today);
                }
            }
            manager.updateAppWidget(id, view);
        }
    }

    private static void fillCalendar(String pkg, RemoteViews view, JSONArray dates, String today) {
        RemoteViews weekdays = new RemoteViews(pkg, R.layout.widget_row);
        for (String day : WEEKDAYS) addCell(pkg, weekdays, day, BLUE, day);
        view.addView(R.id.widget_rows, weekdays);

        for (int week = 0; week < 6; week++) {
            RemoteViews row = new RemoteViews(pkg, R.layout.widget_row);
            for (int day = 0; day < 7; day++) {
                JSONObject cell = dates.optJSONObject(week * 7 + day);
                String date = cell.optString("date");
                int count = cell.optInt("count");
                if (!date.substring(0, 7).equals(today.substring(0, 7))) {
                    addCell(pkg, row, "", INK, "");
                    continue;
                }
                String label = date.substring(8).replaceFirst("^0", "");
                addCell(pkg, row, date.equals(today) ? "[" + label + "]" : label + (count > 0 ? "·" : ""),
                        date.equals(today) || count > 0 ? BLUE : INK,
                        label + "일" + (date.equals(today) ? " 오늘" : "") + " · 일정 " + count + "개");
            }
            view.addView(R.id.widget_rows, row);
        }
    }

    private static void addCell(String pkg, RemoteViews row, String label, int color, String description) {
        RemoteViews cell = new RemoteViews(pkg, R.layout.widget_cell);
        cell.setTextViewText(R.id.widget_cell, label);
        cell.setTextColor(R.id.widget_cell, color);
        cell.setContentDescription(R.id.widget_cell, description);
        row.addView(R.id.widget_row, cell);
    }

    private static void fillTimetable(String pkg, RemoteViews view, JSONArray dates, String today) {
        for (int day = 0; day < 7; day++) {
            JSONObject value = dates.optJSONObject(day);
            JSONArray entries = value.optJSONArray("entries");
            RemoteViews row = new RemoteViews(pkg, R.layout.widget_timetable_row);
            row.setTextViewText(R.id.widget_day, WEEKDAYS[day] + " " + value.optString("date").substring(8).replaceFirst("^0", ""));
            if (today.equals(value.optString("date"))) row.setTextColor(R.id.widget_day, BLUE);
            StringBuilder details = new StringBuilder();
            for (int i = 0; i < entries.length(); i++) {
                JSONObject entry = entries.optJSONObject(i);
                if (i > 0) details.append(" · ");
                details.append(entry.optString("time"));
                String title = entry.optString("title");
                if (!title.isEmpty()) details.append(" ").append(title);
            }
            int extra = value.optInt("count") - entries.length();
            if (extra > 0) details.append(" +").append(extra);
            row.setTextViewText(R.id.widget_entries, details.length() == 0 ? "—" : details.toString());
            view.addView(R.id.widget_rows, row);
        }
    }
}
