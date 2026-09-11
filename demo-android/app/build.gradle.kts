plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.carlossweb.mithrillynxui"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.carlossweb.mithrillynxui"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("org.lynxsdk.lynx:lynx:4.1.0")
    // <input>/<textarea> are opt-in xelement components, not part of the core
    // `lynx` artifact — xelement supplies XElementBehaviors (registered in
    // MainActivity), xelement-input the actual native implementation. Needed
    // from the gallery's Phase 4 (Input/TextArea) onward; harmless before.
    implementation("org.lynxsdk.lynx:xelement:4.1.0")
    implementation("org.lynxsdk.lynx:xelement-input:4.1.0")
    // <overlay> is an opt-in xelement too — the core artifact ships no native
    // implementation for it, so without this the element mounts without error
    // and simply never appears. Verified on device: same class of trap as
    // <input>, and the reason Dialog/Sheet/Popover (Phase 7) will require it.
    implementation("org.lynxsdk.lynx:xelement-overlay:4.1.0")
    // Without a registered ILynxLogService implementation, console.log() and
    // JS runtime errors from the bundle are dropped silently — confirmed the
    // hard way. A gallery whose whole job is to surface component behaviour
    // keeps logging on permanently (a shipped app would not).
    implementation("org.lynxsdk.lynx:lynx-service-log:4.1.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-splashscreen:1.0.1")
}
