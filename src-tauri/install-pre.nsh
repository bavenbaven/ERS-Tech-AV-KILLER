!macro NSIS_HOOK_PREINSTALL
  ; Kill any running instances
  nsExec::ExecToLog 'taskkill /F /IM "ers-tech-av-killer.exe"'
  Pop $0
  nsExec::ExecToLog 'taskkill /F /IM "adb.exe"'
  Pop $0

  ; Wait for processes to fully release file locks
  Sleep 2000

  ; Delete old installation files
  Delete "$INSTDIR\ers-tech-av-killer.exe"
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR\server"

  ; Clean up any leftover temp files
  Sleep 1000
!macroend
