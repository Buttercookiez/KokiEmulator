package com.koki.emulator;

import android.view.HapticFeedbackConstants;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PlayerUi")
public class PlayerUiPlugin extends Plugin {
    @PluginMethod public void setImmersive(PluginCall call) {
        final boolean active = Boolean.TRUE.equals(call.getBoolean("active", false));
        getActivity().runOnUiThread(() -> {
            ((MainActivity)getActivity()).setPlayerActive(active);
            call.resolve();
        });
    }
    @PluginMethod public void haptic(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            // Respect the device's system haptic setting; no vibration permission is needed.
            getActivity().getWindow().getDecorView().performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            call.resolve();
        });
    }
}
