package com.carlossweb.mithrillynxui

import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.ThreadStrategyForRendering
import com.lynx.tasm.fontface.FontFaceManager
import com.lynx.xelement.XElementBehaviors

/**
 * Host for the mithril-lynx-ui gallery bundle. Deliberately thinner than
 * indicadores-android's MainActivity — no storage module, no IFR initData,
 * no font prefetch — since the gallery has no business logic to hydrate.
 *
 * It DOES register XElementBehaviors up front: <input>/<textarea> are
 * opt-in "xelement" components, not part of the core `lynx` artifact, so
 * without this they render at zero size and never open the keyboard
 * (confirmed on real hardware 2026-09-10, during indicadores-app's
 * since-reverted calculator feature). The gallery will need them from
 * Phase 4 onward, and paying for them here costs only this host, never a
 * consuming app that doesn't use those components.
 */
class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)

        // Dev/QA convenience only — this is the on-device verification
        // gallery, not a shipped app, and long device-testing sessions
        // otherwise keep fighting the screen lock.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        val builder = LynxViewBuilder()
        builder.addBehaviors(XElementBehaviors().create())
        builder.setThreadStrategyForRendering(ThreadStrategyForRendering.ALL_ON_UI)
        // Reads the bundle off the Android UI thread — see
        // AssetTemplateProvider's own header comment for why that matters.
        builder.setTemplateProvider(AssetTemplateProvider(this))
        val lynxView = builder.build(this)
        setContentView(lynxView)

        // Prefetch the custom font on Lynx's own IO thread pool as early as
        // possible — before renderTemplateUrl() below ever gives the
        // bundle's CSS a chance to trigger @font-face resolution during the
        // first layout, which resolves synchronously inside
        // __FlushElementTree() and costs real cold-start time on a
        // low/mid-end device. FontFaceManager caches by the exact "src"
        // string, so this "asset:///fonts/inter.ttf" URI must match
        // style.css's @font-face src url() byte-for-byte for the later real
        // lookup to hit this warmed cache entry — see
        // AssetFontFaceLoader.kt's own header and
        // https://github.com/lynx-family/lynx/issues/9431.
        FontFaceManager.getInstance().prefetchFont(
            lynxView.lynxContext,
            "asset:///fonts/inter.ttf",
            null,
            object : FontFaceManager.FontFacePrefetchListener {
                override fun onComplete(code: Int, msg: String) {}
            },
        )

        lynxView.renderTemplateUrl("main-thread.bundle", "")
    }
}
