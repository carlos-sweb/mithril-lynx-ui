package com.carlossweb.mithrillynxui

import android.app.Application
import com.lynx.service.log.LynxLogService
import com.lynx.tasm.LynxEnv
import com.lynx.tasm.loader.LynxFontFaceLoader
import com.lynx.tasm.service.LynxServiceCenter

class DemoApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // No LynxHttpService here, unlike indicadores-android: the gallery
        // renders entirely from the bundle and never calls lynx.fetch().
        //
        // The log service, though, is not optional for a dev gallery: without
        // it every console.log() and every JS error from the bundle vanishes
        // with no trace in logcat.
        LynxServiceCenter.inst().registerService(LynxLogService)
        LynxLogService.switchLogToSystem(true)

        // Lets "asset:///" resolve at all, for both the real @font-face
        // lookup and MainActivity's own prefetchFont() call — see
        // AssetFontFaceLoader's own header and
        // https://github.com/lynx-family/lynx/issues/9431.
        LynxFontFaceLoader.setLoader(AssetFontFaceLoader)

        LynxEnv.inst().init(this, null, null, null)
    }
}
