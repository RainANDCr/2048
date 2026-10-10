package com.xuzhihang.game2048;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.IOException;

public class MainActivity extends Activity {
    private WebView webView;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(250, 248, 239));
        getWindow().setNavigationBarColor(Color.rgb(250, 248, 239));
        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(250, 248, 239));
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        webView.getSettings().setAllowFileAccess(false);
        webView.getSettings().setAllowContentAccess(false);
        webView.getSettings().setSupportZoom(false);
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        webView.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"game2048.local".equals(request.getUrl().getHost());
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String path = request.getUrl().getPath();
                if ("https".equals(request.getUrl().getScheme()) && "game2048.local".equals(request.getUrl().getHost())) {
                    String file = path == null || "/".equals(path) ? "index.html" : path.substring(1);
                    if (file.equals("index.html") || file.equals("style.css") || file.equals("script.js")) {
                        String mime = file.endsWith(".html") ? "text/html" : file.endsWith(".css") ? "text/css" : "application/javascript";
                        try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(file)); }
                        catch (IOException ignored) { }
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                        new ByteArrayInputStream(new byte[0]));
            }
        });
        setContentView(webView);
        webView.loadUrl("https://game2048.local/index.html");
    }

    @Override protected void onPause() { webView.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (webView != null) webView.onResume(); }
    @Override protected void onDestroy() { webView.destroy(); super.onDestroy(); }
}
