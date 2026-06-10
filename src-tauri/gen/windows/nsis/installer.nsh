; Kill any running app and ADB processes before install/uninstall
!macro customInit
  ; Kill app processes
  nsExec::Exec 'taskkill /f /im "ers-tech-av-killer.exe" 2>nul'
  nsExec::Exec 'taskkill /f /im "ERS Tech AV Killer.exe" 2>nul'
  ; Kill ADB processes that may lock files
  nsExec::Exec 'taskkill /f /im "adb.exe" 2>nul'
  Sleep 500
!macroend

!macro customUnInit
  nsExec::Exec 'taskkill /f /im "ers-tech-av-killer.exe" 2>nul'
  nsExec::Exec 'taskkill /f /im "ERS Tech AV Killer.exe" 2>nul'
  nsExec::Exec 'taskkill /f /im "adb.exe" 2>nul'
  Sleep 500
!macroend
