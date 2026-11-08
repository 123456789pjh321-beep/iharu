package com.myiharu.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.google.androidbrowserhelper.trusted.LauncherActivity;

/** Opens only our HTTPS origin; external Intent extras are never forwarded. */
public final class MainActivity extends LauncherActivity {
    @Override
    protected void onCreate(Bundle state) {
        Intent incoming = getIntent();
        Uri url = incoming.getData();
        boolean ownOrigin = url != null && "https".equalsIgnoreCase(url.getScheme())
            && "myiharu.com".equalsIgnoreCase(url.getHost())
            && (url.getPort() == -1 || url.getPort() == 443)
            && url.getUserInfo() == null;
        Intent clean = new Intent(this, MainActivity.class);
        clean.setAction(incoming.getAction());
        clean.setFlags(incoming.getFlags());
        clean.setData(ownOrigin ? url : Uri.parse("https://myiharu.com/today"));
        setIntent(clean);
        super.onCreate(state);
    }
}
