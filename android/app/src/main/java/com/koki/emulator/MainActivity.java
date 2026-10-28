package com.koki.emulator;

import android.os.Bundle;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean playerActive = false;
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlayerUiPlugin.class);
        super.onCreate(savedInstanceState);
    }
    public void setPlayerActive(boolean active) {
        playerActive = active;
        updateSystemBars();
    }
    private void updateSystemBars() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        if (playerActive) controller.hide(WindowInsetsCompat.Type.systemBars());
        else controller.show(WindowInsetsCompat.Type.systemBars());
    }
    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) updateSystemBars();
    }
}
