#!/usr/bin/env pwsh
<#
.SYNOPSIS
G4F Integration Quick Verification
Verifica rápidamente que G4F está configurado correctamente

.DESCRIPTION
Ejecuta verificaciones clave del sistema G4F

.EXAMPLE
.\verify-g4f-setup.ps1
#>

$ErrorActionPreference = "Continue"

function Write-Status {
    param(
        [string]$Test,
        [bool]$Status,
        [string]$Details = ""
    )
    
    $symbol = if ($Status) { "✅" } else { "❌" }
    $statusText = if ($Status) { "PASS" } else { "FAIL" }
    
    Write-Host "$symbol $Test" -ForegroundColor $(if ($Status) { "Green" } else { "Red" }) -NoNewline
    Write-Host " [$statusText]" -ForegroundColor $(if ($Status) { "Green" } else { "Red" })
    
    if ($Details) {
        Write-Host "   → $Details" -ForegroundColor Yellow
    }
}

function Test-G4FImport {
    Write-Host "`n[Test 1] Verificar que g4f se puede importar..." -ForegroundColor Cyan
    try {
        $version = python -c "import g4f; print(g4f.__version__)" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Status "G4F Import" $true "v$version"
            return $true
        } else {
            Write-Status "G4F Import" $false "Instala con: pip install g4f"
            return $false
        }
    } catch {
        Write-Status "G4F Import" $false "Error: $_"
        return $false
    }
}

function Test-ProvidersCount {
    Write-Host "`n[Test 2] Contar proveedores disponibles..." -ForegroundColor Cyan
    try {
        $count = python -c "import g4f; print(len(g4f.Provider.__members__))" 2>$null
        if ($LASTEXITCODE -eq 0) {
            Write-Status "Providers Count" $true "$count proveedores disponibles"
            return $true
        } else {
            Write-Status "Providers Count" $false "No se puede acceder a g4f.Provider"
            return $false
        }
    } catch {
        Write-Status "Providers Count" $false "Error: $_"
        return $false
    }
}

function Test-EnvVariables {
    Write-Host "`n[Test 3] Verificar variables de entorno..." -ForegroundColor Cyan
    
    # Buscar archivo .env
    $envFile = ".env"
    if (-not (Test-Path $envFile)) {
        Write-Status "ENV File" $false ".env no encontrado"
        return $false
    }
    
    $envContent = Get-Content $envFile -Raw
    
    # Verificar G4F_ENABLED
    if ($envContent -match "G4F_ENABLED=true") {
        Write-Status ".env G4F_ENABLED" $true "true"
    } else {
        Write-Status ".env G4F_ENABLED" $false "Debe estar habilitado"
        return $false
    }
    
    # Verificar G4F_PROVIDER
    if ($envContent -match "G4F_PROVIDER=auto") {
        Write-Status ".env G4F_PROVIDER" $true "auto"
    } else {
        Write-Status ".env G4F_PROVIDER" $false "Debe ser 'auto'"
    }
    
    # Verificar G4F en AI_FALLBACK_ORDER
    if ($envContent -match "g4f" -and $envContent -match "AI_FALLBACK_ORDER") {
        Write-Status ".env AI_FALLBACK_ORDER" $true "G4F incluido en fallback"
        return $true
    } else {
        Write-Status ".env AI_FALLBACK_ORDER" $false "G4F no está en fallback"
        return $false
    }
}

function Test-SimpleRequest {
    Write-Host "`n[Test 4] Prueba simple de respuesta..." -ForegroundColor Cyan
    try {
        $pythonCode = @"
import g4f
import sys
sys.stdout.reconfigure(encoding='utf-8')

try:
    response = g4f.ChatCompletion.create(
        model='gpt-3.5-turbo',
        messages=[{'role': 'user', 'content': 'Responde con OK'}],
        timeout=10,
    )
    
    if response:
        print('OK')
    else:
        print('EMPTY')
except Exception as e:
    print(f'ERROR: {e}')
"@
        
        $result = python -c $pythonCode 2>$null
        
        if ($result -eq "OK") {
            Write-Status "Simple Request" $true "Respuesta recibida"
            return $true
        } else {
            Write-Status "Simple Request" $false "No se recibió respuesta válida"
            return $false
        }
    } catch {
        Write-Status "Simple Request" $false "Error: $_"
        return $false
    }
}

function Test-ConfigFiles {
    Write-Host "`n[Test 5] Verificar archivos de configuración..." -ForegroundColor Cyan
    
    $files = @(
        "artifacts/api-server/src/config/g4f.config.ts",
        "artifacts/api-server/src/lib/providers/g4f-provider.ts",
        "G4F_INTEGRACION_COMPLETA.md"
    )
    
    $allFound = $true
    foreach ($file in $files) {
        if (Test-Path $file) {
            Write-Status "Config File: $file" $true "Existe"
        } else {
            Write-Status "Config File: $file" $false "No encontrado"
            $allFound = $false
        }
    }
    
    return $allFound
}

function Test-Documentation {
    Write-Host "`n[Test 6] Verificar documentación..." -ForegroundColor Cyan
    
    $docFile = "G4F_INTEGRACION_COMPLETA.md"
    if (Test-Path $docFile) {
        $content = Get-Content $docFile -Raw
        if ($content -match "G4F" -and $content -match "rotación") {
            Write-Status "Documentation" $true "Guía completa presente"
            return $true
        } else {
            Write-Status "Documentation" $false "Guía incompleta"
            return $false
        }
    } else {
        Write-Status "Documentation" $false "Guía no encontrada"
        return $false
    }
}

# Ejecutar todas las pruebas
Write-Host "`n" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "🤖 G4F INTEGRATION VERIFICATION" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

$results = @()

$results += Test-G4FImport
$results += Test-ProvidersCount
$results += Test-EnvVariables
$results += Test-SimpleRequest
$results += Test-ConfigFiles
$results += Test-Documentation

$passed = ($results | Where-Object { $_ -eq $true }).Count
$total = $results.Count
$percentage = if ($total -gt 0) { ($passed / $total) * 100 } else { 0 }

Write-Host "`n════════════════════════════════════════════════════════════════════════" -ForegroundColor Cyan

if ($percentage -ge 90) {
    Write-Host "`n🎉 ¡G4F está completamente operacional! ($passed/$total pruebas pasadas - ${percentage:F0}%)`n" -ForegroundColor Green
} elseif ($percentage -ge 70) {
    Write-Host "`n⚠️  G4F está parcialmente disponible ($passed/$total pruebas pasadas - ${percentage:F0}%)`n" -ForegroundColor Yellow
} else {
    Write-Host "`n❌ G4F tiene problemas ($passed/$total pruebas pasadas - ${percentage:F0}%)`n" -ForegroundColor Red
}

Write-Host "════════════════════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

# Mostrar comandos recomendados
Write-Host "📝 Próximos pasos:" -ForegroundColor Cyan
Write-Host "   1. Instalar G4F: npm install g4f" -ForegroundColor Gray
Write-Host "   2. Verificar .env: grep 'G4F' .env" -ForegroundColor Gray
Write-Host "   3. Ejecutar tests: python test-g4f-integration.py" -ForegroundColor Gray
Write-Host "   4. Iniciar servidor: npm run start" -ForegroundColor Gray

exit if ($percentage -ge 70) { 0 } else { 1 }
