Final BitWallet Repo (offline web + Android WebView wrapper)

Structure:
- android-app/: Android project (app/) with WebView that loads bundled web wallet from assets (file:///android_asset/www/index.html)
- .github/workflows/build-apk.yml : GitHub Actions workflow to build debug APK in cloud
- codemagic.yaml : Codemagic config to build debug APK

How to use (simplest):
1. Upload this entire repo ZIP to GitHub (create new repo, drag & drop the unzipped files).
2. On GitHub, go to Actions → Build Android APK → Run workflow (or push to main). The workflow will run Gradle in GitHub's environment and produce an artifact (app-debug.apk).
3. Download the artifact and install on your Android phone (enable install from unknown sources).

Notes:
- This is a demo offline WebView app for testing UPI intents and basic UI. It does not connect to Bitcoin network.
- If GitHub Actions fails due to missing Gradle wrapper, you can let Actions install Gradle or I can add a full wrapper; ask me and I'll include it.

