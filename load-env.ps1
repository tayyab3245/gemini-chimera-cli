# PowerShell script to load environment variables from .env file
# Run this with: .\load-env.ps1

if (Test-Path ".env") {
    Write-Host "Loading environment variables from .env file..." -ForegroundColor Green
    
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*([^#][^=]*)\s*=\s*(.*)\s*$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            
            # Remove quotes if present
            if ($value -match '^"(.*)"$') {
                $value = $matches[1]
            }
            
            Set-Item -Path "env:$name" -Value $value
            Write-Host "  Set $name" -ForegroundColor Gray
        }
    }
    
    Write-Host "Environment variables loaded successfully!" -ForegroundColor Green
    Write-Host "GEMINI_API_KEY is set: $($env:GEMINI_API_KEY -ne $null -and $env:GEMINI_API_KEY -ne '')" -ForegroundColor Cyan
} else {
    Write-Host ".env file not found!" -ForegroundColor Red
    Write-Host "Please create a .env file with your GEMINI_API_KEY" -ForegroundColor Yellow
}
