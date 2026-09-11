package com.carlossweb.mithrillynxui

import android.app.Application
import com.lynx.tasm.LynxEnv

class DemoApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // No LynxHttpService here, unlike indicadores-android: the gallery
        // renders entirely from the bundle and never calls lynx.fetch().
        LynxEnv.inst().init(this, null, null, null)
    }
}
