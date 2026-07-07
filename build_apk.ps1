$ErrorActionPreference = "Stop"

$workspace = "C:\Users\sovannak\Desktop\DUC"
$buildTools = "$workspace\.build_tools"

# Create build tools directory
if (!(Test-Path $buildTools)) {
    New-Item -ItemType Directory -Path $buildTools | Out-Null
}

$flutterZip = "$buildTools\flutter.zip"
$jdkZip = "$buildTools\jdk.zip"
$androidZip = "$buildTools\cmdline-tools.zip"

# URLs
$flutterUrl = "https://storage.googleapis.com/flutter_infra_release/releases/stable/windows/flutter_windows_3.22.2-stable.zip"
$jdkUrl = "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.11%2B9/OpenJDK17U-jdk_x64_windows_hotspot_17.0.11_9.zip"
$androidUrl = "https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip"

Write-Host "=== 1. Downloading Build Tools (~1.4 GB total) ==="

# Download Flutter
if (!(Test-Path $flutterZip)) {
    Write-Host "Downloading Flutter SDK (1.02 GB)..."
    Start-BitsTransfer -Source $flutterUrl -Destination $flutterZip -DisplayName "Downloading Flutter SDK"
} else {
    Write-Host "Flutter SDK ZIP already exists."
}

# Download JDK
if (!(Test-Path $jdkZip)) {
    Write-Host "Downloading OpenJDK 17 (180 MB)..."
    Start-BitsTransfer -Source $jdkUrl -Destination $jdkZip -DisplayName "Downloading OpenJDK"
} else {
    Write-Host "OpenJDK ZIP already exists."
}

# Download Android cmdline-tools
if (!(Test-Path $androidZip)) {
    Write-Host "Downloading Android SDK Command-Line Tools (145 MB)..."
    Start-BitsTransfer -Source $androidUrl -Destination $androidZip -DisplayName "Downloading Android cmdline-tools"
} else {
    Write-Host "Android cmdline-tools ZIP already exists."
}

Write-Host "=== 2. Extracting Build Tools ==="

# Extract JDK
$jdkDir = "$buildTools\jdk"
if (!(Test-Path $jdkDir)) {
    Write-Host "Extracting OpenJDK 17..."
    Expand-Archive -Path $jdkZip -DestinationPath $buildTools
    # Expand-Archive extracts to a subfolder like jdk-17.0.11+9. Let's rename it to jdk
    $extractedFolder = Get-ChildItem -Path $buildTools -Directory | Where-Object { $_.Name -like "jdk*" } | Select-Object -First 1
    if ($extractedFolder) {
        Rename-Item -Path $extractedFolder.FullName -NewName "jdk"
    }
} else {
    Write-Host "OpenJDK already extracted."
}

# Extract Flutter
$flutterDir = "$buildTools\flutter"
if (!(Test-Path $flutterDir)) {
    Write-Host "Extracting Flutter SDK (This can take a minute)..."
    Expand-Archive -Path $flutterZip -DestinationPath $buildTools
} else {
    Write-Host "Flutter SDK already extracted."
}

# Extract Android Command-Line Tools
$androidDir = "$buildTools\android"
$cmdlineDir = "$androidDir\cmdline-tools"
if (!(Test-Path "$cmdlineDir\latest")) {
    Write-Host "Extracting Android Command-Line Tools..."
    New-Item -ItemType Directory -Path $androidDir -Force | Out-Null
    Expand-Archive -Path $androidZip -DestinationPath $cmdlineDir
    
    # Android sdkmanager expects cmdline-tools in structure: cmdline-tools/latest/bin/sdkmanager
    $innerFolder = Join-Path $cmdlineDir "cmdline-tools"
    $latestFolder = Join-Path $cmdlineDir "latest"
    if (Test-Path $innerFolder) {
        Rename-Item -Path $innerFolder -NewName "latest"
    } else {
        New-Item -ItemType Directory -Path $latestFolder -Force | Out-Null
        Get-ChildItem -Path $cmdlineDir -Exclude "latest" | Move-Item -Destination $latestFolder
    }
} else {
    Write-Host "Android Command-Line Tools already extracted."
}

Write-Host "=== 3. Configuring Environment ==="

# Set Environment variables for this process session
$env:JAVA_HOME = "$jdkDir"
$env:ANDROID_HOME = "$androidDir"
$env:PATH = "$jdkDir\bin;$androidDir\cmdline-tools\latest\bin;$androidDir\platform-tools;$flutterDir\bin;$env:PATH"

# Verify tools
Write-Host "Verifying Java..."
java -version
Write-Host "Verifying Flutter..."
flutter --version

Write-Host "=== 4. Setting up Android SDK & Licenses ==="

# Create empty repositories.cfg to suppress warnings
$sdkUserConfig = "$env:USERPROFILE\.android"
if (!(Test-Path $sdkUserConfig)) {
    New-Item -ItemType Directory -Path $sdkUserConfig -Force | Out-Null
}
New-Item -ItemType File -Path "$sdkUserConfig\repositories.cfg" -Force | Out-Null

# Accept licenses using input redirection
Write-Host "Accepting Android SDK licenses..."
$y = "y`ny`ny`ny`ny`ny`ny`n"
$y | & "$androidDir\cmdline-tools\latest\bin\sdkmanager.bat" --licenses

# Install platform tools, build tools, platforms
Write-Host "Installing platform-tools, build-tools 34.0.0, and android-34 platform..."
& "$androidDir\cmdline-tools\latest\bin\sdkmanager.bat" "platform-tools" "build-tools;34.0.0" "platforms;android-34"

# Configure Flutter Android SDK path
flutter config --android-sdk $androidDir

Write-Host "=== 5. Building the Mobile App APK ==="

cd "$workspace\mobile-app"

# Clean build artifacts
Write-Host "Cleaning project build cache..."
& "$flutterDir\bin\flutter.bat" clean

# Generate Android platform project files
Write-Host "Generating Android project files..."
flutter create --platforms=android --project-name=student_geofence_app .

# Fetch pub packages
Write-Host "Fetching dependencies..."
flutter pub get

# Build Release APK
Write-Host "Compiling Release APK..."
flutter build apk --release

Write-Host "=== BUILD COMPLETE! ==="
$apkPath = "$workspace\mobile-app\build\app\outputs\flutter-apk\app-release.apk"
if (Test-Path $apkPath) {
    Write-Host "SUCCESS! Your APK is ready at: $apkPath"
    Copy-Item -Path $apkPath -Destination "$workspace\app-release.apk"
    Write-Host "Copied to workspace root: $workspace\app-release.apk"
} else {
    Write-Error "APK file not found! Build failed."
}
