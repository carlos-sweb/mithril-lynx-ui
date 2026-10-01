package com.carlossweb.mithrillynxui

import android.graphics.Typeface
import com.lynx.tasm.behavior.LynxContext
import com.lynx.tasm.fontface.FontFace
import com.lynx.tasm.loader.LynxFontFaceLoader

// Public, documented Lynx extension point (com.lynx.tasm.loader.LynxFontFaceLoader,
// shipped in the core `lynx` artifact) for resolving custom @font-face src
// schemes. Without a registered Loader, Lynx's own default is a no-op that
// never resolves "asset:///" — same root cause and fix as
// indicadores-android's own AssetFontFaceLoader.kt (see that file's header
// and https://github.com/lynx-family/lynx/issues/9431). Required for BOTH
// the real @font-face lookup AND MainActivity's own prefetchFont() call
// below to be able to resolve "asset:///fonts/inter.ttf" at all.
object AssetFontFaceLoader : LynxFontFaceLoader.Loader() {
    private const val ASSET_PREFIX = "asset:///"

    override fun onLoadFontFace(
        context: LynxContext,
        type: FontFace.TYPE,
        src: String,
    ): Typeface? {
        if (!src.startsWith(ASSET_PREFIX)) return null
        return try {
            Typeface.createFromAsset(context.context.assets, src.removePrefix(ASSET_PREFIX))
        } catch (e: Exception) {
            null
        }
    }
}
