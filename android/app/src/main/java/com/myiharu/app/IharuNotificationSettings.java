package com.myiharu.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

public final class IharuNotificationSettings extends Activity {
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri uri = getIntent().getData();
        if (Intent.ACTION_VIEW.equals(getIntent().getAction()) && uri != null
                && "iharu-settings".equals(uri.getScheme()) && "notifications".equals(uri.getHost())) {
            Intent settings = Build.VERSION.SDK_INT >= 26
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getPackageName(), null));
            startActivity(settings);
        }
        finish();
    }
}
