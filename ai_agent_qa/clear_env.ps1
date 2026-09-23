[System.Environment]::SetEnvironmentVariable("OPENAI_API_KEY", $null, "User")
Write-Host "OPENAI_API_KEY user env var removed"
Write-Host "Current value: $env:OPENAI_API_KEY"
