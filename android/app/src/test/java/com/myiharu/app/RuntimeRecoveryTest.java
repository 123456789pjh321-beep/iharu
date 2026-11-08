package com.myiharu.app;

import static org.junit.Assert.*;
import static org.robolectric.Shadows.shadowOf;
import android.content.Context;
import android.content.Intent;
import android.content.ComponentName;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Looper;
import android.widget.TextView;
import android.view.View;
import android.view.ViewGroup;
import androidx.browser.customtabs.CustomTabsCallback;
import com.google.androidbrowserhelper.trusted.QualityEnforcer;
import com.google.androidbrowserhelper.trusted.ManageDataLauncherActivity;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

@RunWith(RobolectricTestRunner.class)
@Config(sdk={28,35})
public class RuntimeRecoveryTest {
    @Test public void browserDataManagerExistsBeforeOnlineLauncherEnablesIt() throws Exception {
        Context context = RuntimeEnvironment.getApplication();
        ComponentName component = new ComponentName(context,ManageDataLauncherActivity.class);
        var info = context.getPackageManager().getActivityInfo(component,PackageManager.GET_META_DATA);
        assertFalse(info.exported);
        assertEquals("https://myiharu.com/today",info.metaData.getString("android.support.customtabs.trusted.MANAGE_SPACE_URL"));
        assertEquals(component.getClassName(),context.getApplicationInfo().manageSpaceActivityName);
        // This is the exact call that threw on-device when the manifest entry was absent.
        ManageDataLauncherActivity.addSiteSettingsShortcut(context,null);
        assertEquals(PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
            context.getPackageManager().getComponentEnabledSetting(component));
    }
    @Test public void oldQualityEnforcerReproducesMainThreadCrash() {
        Bundle args = new Bundle(); args.putString("crash_reason", "offline navigation fixture");
        new QualityEnforcer().extraCallbackWithResult("quality_enforcement.crash", args);
        assertThrows(RuntimeException.class, () -> shadowOf(Looper.getMainLooper()).idle());
    }
    @Test public void qualityFailureShowsGuidanceOnceWithoutCrashing() {
        AtomicInteger notices = new AtomicInteger();
        RecoverableTabsCallback callback = new RecoverableTabsCallback(() -> notices.incrementAndGet());
        Bundle args = new Bundle(); args.putString("crash_reason", "https://myiharu.com/login?token=must-not-log");
        callback.extraCallbackWithResult("quality_enforcement.crash", args);
        callback.onNavigationEvent(CustomTabsCallback.NAVIGATION_FAILED, null);
        callback.extraCallbackWithResult("unrelated", null);
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals(1, notices.get());
        callback.onNavigationEvent(CustomTabsCallback.NAVIGATION_FINISHED, null);
        callback.onNavigationEvent(CustomTabsCallback.NAVIGATION_FAILED, null);
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals(2, notices.get());
    }
    @Test public void homeIconKeepsResumeSemanticsAndDropsUntrustedPayload() {
        Context context = RuntimeEnvironment.getApplication();
        Intent input = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION)
            .putExtra("android.intent.extra.STREAM", Uri.parse("content://private/data"));
        Intent clean = MainActivity.sanitizeIntent(context,input);
        assertNull(clean.getData());
        assertNull(clean.getExtras());
        assertTrue(clean.hasCategory(Intent.CATEGORY_LAUNCHER));
        assertEquals(Intent.FLAG_ACTIVITY_NEW_TASK, clean.getFlags());
    }
    @Test public void ownLinksSurviveAndForeignLinksCannotReachTheBrowser() {
        Context context = RuntimeEnvironment.getApplication();
        String[] rejected = {"https://evil.example/today","https://myiharu.com.evil.example/", "https://user@myiharu.com/", "http://myiharu.com/", "https://myiharu.com:444/", "content://private/data"};
        for (String url : rejected) assertEquals("https://myiharu.com/today",
            MainActivity.sanitizeIntent(context,new Intent(Intent.ACTION_VIEW,Uri.parse(url))).getData().toString());
        assertEquals("https://myiharu.com/timetable?date=2026-11-09",
            MainActivity.sanitizeIntent(context,new Intent(Intent.ACTION_VIEW,Uri.parse("https://myiharu.com/timetable?date=2026-11-09"))).getData().toString());
        assertNull(MainActivity.sanitizeIntent(context,null).getData());
    }
    @Test public void offlineLaunchAndRetryStayInRecoveryScreen() {
        Intent intent = new Intent(RuntimeEnvironment.getApplication(),MainActivity.class)
            .setAction(Intent.ACTION_MAIN).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try (var controller = Robolectric.buildActivity(MainActivity.class,intent).create().start().resume().visible()) {
            MainActivity activity = controller.get();
            View root=activity.findViewById(android.R.id.content);
            assertNotNull(find(root,"인터넷 연결을 확인해 주세요"));
            View retry=find(root,"다시 연결"); assertNotNull(retry); retry.performClick();
            assertFalse(activity.isFinishing());
            assertNull(shadowOf(activity).getNextStartedActivity());
        }
    }
    private View find(View view,String text) {
        if (view instanceof TextView && text.contentEquals(((TextView)view).getText())) return view;
        if (view instanceof ViewGroup) for (int i=0;i<((ViewGroup)view).getChildCount();i++) {
            View found=find(((ViewGroup)view).getChildAt(i),text); if (found!=null) return found;
        }
        return null;
    }
}
