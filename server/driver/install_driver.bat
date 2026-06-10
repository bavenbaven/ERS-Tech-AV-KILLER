@echo off
title ERS Tech ADB Driver Installer
cd /d "%~dp0"
echo ========================================
echo  ERS Tech ADB Driver Installer
echo ========================================
echo.
echo [1/3] Checking system architecture...
if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set ARCH=amd64
    echo  Detected: 64-bit Windows
) else if "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
    set ARCH=arm64
    echo  Detected: ARM64 Windows
) else (
    set ARCH=x86
    echo  Detected: 32-bit Windows
)
echo.

echo [2/3] Installing ADB driver...
pnputil /add-driver "%~dp0android_winusb.inf" /install 2>nul
if %ERRORLEVEL%==0 (
    echo  Success! ADB driver installed.
) else (
    echo  Note: Try alternative method...
    rundll32.exe syssetup,SetupInfObjectInstallAction DefaultInstall 128 "%~dp0android_winusb.inf" 2>nul
)
echo.

echo [3/3] Verifying ADB...
"%~dp0..\platform-tools\adb.exe" kill-server >nul 2>&1
"%~dp0..\platform-tools\adb.exe" start-server >nul 2>&1
echo.
echo ========================================
echo  Driver installation complete!
echo  Please reconnect your phone and
echo  enable USB Debugging in Developer Options.
echo ========================================
timeout /t 5 >nul
