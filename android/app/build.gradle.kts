plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.chaquo.python")
}

// GitHub gives every build a number; it becomes the app version
val buildNumber = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
val keystorePath: String? = System.getenv("REELKEEP_KEYSTORE")

android {
    namespace = "com.hsfault.reelkeep"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.hsfault.reelkeep"
        minSdk = 24
        targetSdk = 34
        versionCode = buildNumber
        versionName = "1.0.$buildNumber"

        ndk {
            // 32-bit and 64-bit phones (needs Python 3.11 or older)
            abiFilters += listOf("armeabi-v7a", "arm64-v8a")
        }
    }

    signingConfigs {
        create("reelkeep") {
            if (keystorePath != null) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("REELKEEP_KEYSTORE_PASSWORD")
                keyAlias = "reelkeep"
                keyPassword = System.getenv("REELKEEP_KEYSTORE_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = if (keystorePath != null) {
                signingConfigs.getByName("reelkeep")
            } else {
                signingConfigs.getByName("debug") // temporary key until the secret is added
            }
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

chaquopy {
    defaultConfig {
        version = "3.11"
        pip {
            install("starlette>=0.37")
            install("uvicorn>=0.30")
            install("httpx>=0.27")
            install("requests>=2.31")
            install("gallery-dl==1.32.14")
        }
    }
    sourceSets {
        getByName("main") {
            srcDir("../../backend")  // our Python backend, unchanged
            srcDir("web-src")        // built frontend, copied here by the GitHub build
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
}