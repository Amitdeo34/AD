package app.dareup;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Vibrator;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.util.Collections;

/**
 * DareUp Android shell.
 *
 * The whole game is bundled in assets/www and served from
 * https://appassets.androidplatform.net/assets/... so it runs offline and
 * gets a secure origin (needed for localStorage and Razorpay Checkout).
 * Only premium purchases and pack downloads go to the internet.
 */
public class MainActivity extends Activity {

    static final String ASSET_HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + ASSET_HOST + "/assets/www/index.html";

    private WebView web;
    private FrameLayout root;
    private int barColor;
    private String channel = "direct";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        barColor = getResources().getColor(R.color.window_bg);
        channel = readChannel();

        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(Color.TRANSPARENT);
        w.setNavigationBarColor(Color.TRANSPARENT);

        root = new FrameLayout(this);
        root.setBackgroundColor(barColor);
        // Draw edge to edge on every Android version, then pad the WebView
        // by the system bars (and keyboard) so nothing hides behind them.
        root.setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets in) {
                v.setPadding(in.getSystemWindowInsetLeft(), in.getSystemWindowInsetTop(),
                        in.getSystemWindowInsetRight(), in.getSystemWindowInsetBottom());
                return in.consumeSystemWindowInsets();
            }
        });

        web = new WebView(this);
        web.setBackgroundColor(barColor);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " DareUpAndroid/" + versionName());

        web.setWebViewClient(new ShellClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        root.addView(web, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        applyBarIcons(getResources().getBoolean(R.bool.window_is_dark));
        registerPredictiveBack();

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        }
        if (web.getUrl() == null) {
            web.loadUrl(START_URL);
        }
    }

    // ---- Back handling -------------------------------------------------

    /** Ask the game first (close a sheet, go back a screen); exit only from home. */
    private void handleBack() {
        web.evaluateJavascript(
                "(function(){try{return !!(window.onAndroidBack&&window.onAndroidBack());}catch(e){return false;}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String handled) {
                        if ("true".equals(handled)) return;
                        if (web.canGoBack()) {
                            web.goBack();
                        } else {
                            finish();
                        }
                    }
                });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        handleBack();
    }

    /**
     * Android 13+ delivers back through OnBackInvokedDispatcher (and from
     * Android 16 onBackPressed is no longer called). Registered by reflection
     * so the app compiles against older SDK stubs too.
     */
    private void registerPredictiveBack() {
        if (Build.VERSION.SDK_INT < 33) return;
        try {
            Class<?> cbClass = Class.forName("android.window.OnBackInvokedCallback");
            Class<?> dispClass = Class.forName("android.window.OnBackInvokedDispatcher");
            Object dispatcher = Activity.class.getMethod("getOnBackInvokedDispatcher").invoke(this);
            Object callback = Proxy.newProxyInstance(getClassLoader(), new Class<?>[]{cbClass},
                    new InvocationHandler() {
                        @Override
                        public Object invoke(Object proxy, Method m, Object[] args) {
                            String n = m.getName();
                            if ("onBackInvoked".equals(n)) {
                                handleBack();
                                return null;
                            }
                            if ("hashCode".equals(n)) return System.identityHashCode(proxy);
                            if ("equals".equals(n)) return args != null && proxy == args[0];
                            if ("toString".equals(n)) return "DareUpBackCallback";
                            return null;
                        }
                    });
            dispClass.getMethod("registerOnBackInvokedCallback", int.class, cbClass)
                    .invoke(dispatcher, 0, callback);
        } catch (Throwable ignored) {
            // Falls back to onBackPressed on devices where this is unavailable.
        }
    }

    // ---- Lifecycle -----------------------------------------------------

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onPause() {
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            root.removeView(web);
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    // ---- Helpers -------------------------------------------------------

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1";
        }
    }

    private String readChannel() {
        try {
            InputStream in = getAssets().open("channel.txt");
            byte[] buf = new byte[32];
            int n = in.read(buf);
            in.close();
            String c = n > 0 ? new String(buf, 0, n, "UTF-8").trim() : "";
            return "play".equals(c) ? "play" : "direct";
        } catch (IOException e) {
            return "direct";
        }
    }

    private void applyBarIcons(boolean darkBackground) {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        if (!darkBackground) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= 26) flags |= 0x00000010; // SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        }
        root.setSystemUiVisibility(flags);
    }

    private void openExternal(Uri uri) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, uri);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No app found to open this link", Toast.LENGTH_SHORT).show();
        }
    }

    static String mimeFor(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "text/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json") || p.endsWith(".webmanifest")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".mp3")) return "audio/mpeg";
        if (p.endsWith(".ogg")) return "audio/ogg";
        if (p.endsWith(".wav")) return "audio/wav";
        return "application/octet-stream";
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/") || mime.equals("application/json") || mime.equals("image/svg+xml");
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                Collections.<String, String>emptyMap(),
                new ByteArrayInputStream("Not found".getBytes()));
    }

    // ---- WebView client: local assets + link routing --------------------

    private class ShellClient extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
            Uri u = req.getUrl();
            if (!"https".equals(u.getScheme()) || !ASSET_HOST.equals(u.getHost())) {
                return null; // network as normal
            }
            String path = u.getPath();
            if (path == null || !path.startsWith("/assets/") || path.contains("..")) {
                return notFound();
            }
            String rel = path.substring("/assets/".length());
            try {
                InputStream in = getAssets().open(rel);
                String mime = mimeFor(rel);
                WebResourceResponse r = new WebResourceResponse(mime, isText(mime) ? "utf-8" : null, in);
                r.setResponseHeaders(Collections.singletonMap("Cache-Control", "no-cache"));
                return r;
            } catch (IOException e) {
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            return route(req.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return route(Uri.parse(url));
        }

        /** http(s) stays inside (game, Razorpay, bank pages); upi:, intent:, tel: etc. go to other apps. */
        private boolean route(Uri u) {
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            if (scheme.equals("http") || scheme.equals("https")) {
                return false;
            }
            if (scheme.equals("intent")) {
                try {
                    Intent i = Intent.parseUri(u.toString(), Intent.URI_INTENT_SCHEME);
                    i.addCategory(Intent.CATEGORY_BROWSABLE);
                    i.setComponent(null);
                    i.setSelector(null);
                    try {
                        startActivity(i);
                    } catch (ActivityNotFoundException e) {
                        String fallback = i.getStringExtra("browser_fallback_url");
                        if (fallback != null && (fallback.startsWith("https://") || fallback.startsWith("http://"))) {
                            web.loadUrl(fallback);
                        } else {
                            Toast.makeText(MainActivity.this, "App not installed", Toast.LENGTH_SHORT).show();
                        }
                    }
                } catch (Exception e) {
                    Toast.makeText(MainActivity.this, "Could not open this link", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
            if (scheme.equals("javascript") || scheme.equals("file") || scheme.equals("content")) {
                return true; // blocked
            }
            openExternal(u); // upi:, tel:, mailto:, whatsapp:, market: ...
            return true;
        }
    }

    // ---- JavaScript bridge (window.AndroidBridge) -----------------------

    private class Bridge {

        @JavascriptInterface
        public void share(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("text/plain");
                    send.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
                    try {
                        startActivity(Intent.createChooser(send, "Share"));
                    } catch (ActivityNotFoundException ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) v.vibrate(Math.max(1, Math.min(ms, 2000)));
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            if (url == null) return;
            final Uri u = Uri.parse(url);
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            if (!scheme.equals("https") && !scheme.equals("http")) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    openExternal(u);
                }
            });
        }

        @JavascriptInterface
        public void setTheme(final String hex, final boolean dark) {
            final int color;
            try {
                color = Color.parseColor(hex);
            } catch (Exception e) {
                return;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    barColor = color;
                    root.setBackgroundColor(color);
                    if (web != null) web.setBackgroundColor(color);
                    applyBarIcons(dark);
                }
            });
        }

        /** "direct" (APK: Razorpay premium) or "play" (Google Play: no in-app buying). */
        @JavascriptInterface
        public String storeChannel() {
            return channel;
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        @JavascriptInterface
        public String appVersion() {
            return versionName();
        }
    }
}
