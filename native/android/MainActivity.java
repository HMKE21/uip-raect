package __PACKAGE__;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ExamLockPlugin.class); // must be before super.onCreate
        registerPlugin(NativePrintPlugin.class);
        registerPlugin(NativeLinksPlugin.class);
        registerPlugin(NativeFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }

    /** Pulling down the notification shade (or any system dialog) steals focus; hide the bars again when it comes back. */
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && ExamLockPlugin.active) ExamLockPlugin.applyImmersive(this);
    }
}
