Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*dist*main.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2
Set-Location "$PSScriptRoot\..\apps\api"
npm run build
Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "node dist/main.js > %TEMP%\api-out.log 2> %TEMP%\api-err.log" -WorkingDirectory (Get-Location) -WindowStyle Hidden
Start-Sleep -Seconds 7
Write-Output "API restarted."
