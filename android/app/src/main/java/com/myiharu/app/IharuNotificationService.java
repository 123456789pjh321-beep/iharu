package com.myiharu.app;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.annotation.NonNull;
import com.google.androidbrowserhelper.trusted.DelegationService;

/** Posts notifications under the installed app's package after browser-origin verification. */
public final class IharuNotificationService extends DelegationService {
    @Override
    public boolean onNotifyNotificationWithChannel(@NonNull String tag, int id,
            @NonNull Notification notification, @NonNull String channelName) {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        if (!getSystemService(NotificationManager.class).areNotificationsEnabled()) return false;
        notification.visibility = Notification.VISIBILITY_PRIVATE;
        return super.onNotifyNotificationWithChannel(tag, id, notification, getString(R.string.notification_channel));
    }
}
