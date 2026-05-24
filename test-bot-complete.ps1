# Script para probar el bot con preguntas completas
Write-Host "🤖 Iniciando test completo del bot..." -ForegroundColor Cyan

# Preguntas que normally realiza el usuario
$testQuestions = @(
    "Hola, me interesa el megapack de piano",
    "¿Cuál es el precio del megapack?",
    "Me gustaría comprar un curso de idiomas",
    "¿Tienen planes de suscripción?",
    "Quiero los detalles del paquete de membresía",
    "¿Qué productos tienes disponibles?"
)

# Esperar a que el servidor esté listo
function Wait-ForServer {
    $maxAttempts = 30
    $attempt = 0
    
    while ($attempt -lt $maxAttempts) {
        try {
            $response = Invoke-WebRequest -Uri "http://localhost:3002/api/health" -Method Get -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Host "✅ Servidor listo" -ForegroundColor Green
                return $true
            }
        } catch {
            $attempt++
            Write-Host "⏳ Esperando servidor... ($attempt/$maxAttempts)" -ForegroundColor Yellow
            Start-Sleep -Seconds 2
        }
    }
    return $false
}

# Función para hacer una pregunta al bot
function Test-BotQuestion {
    param([string]$Question)
    
    try {
        Write-Host ""
        Write-Host "❓ Pregunta: $Question" -ForegroundColor Cyan
        
        $body = @{ message = $Question } | ConvertTo-Json
        
        $response = Invoke-WebRequest -Uri "http://localhost:3002/api/whatsapp/test-ia" `
            -Method Post -ContentType "application/json" -Body $body -ErrorAction Stop
        
        $result = $response.Content | ConvertFrom-Json
        
        Write-Host "✅ Status: OK" -ForegroundColor Green
        Write-Host "📋 Stage: $($result.stage)" -ForegroundColor Yellow
        Write-Host "💬 Respuesta: $($result.response)" -ForegroundColor White
        
        if ($result.parts) {
            Write-Host "📦 Partes: $($result.parts | ConvertTo-Json)" -ForegroundColor Gray
        }
        
        return $result
    } catch {
        Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Iniciar servidor en background
Write-Host "🚀 Iniciando servidor..." -ForegroundColor Cyan
$serverProcess = Start-Process -FilePath "pnpm" -ArgumentList "run", "dev" `
    -WorkingDirectory "C:\Users\ADMIN\Videos\Agent-Sales-Bot" `
    -NoNewWindow -PassThru

Write-Host "⏳ PID: $($serverProcess.Id)" -ForegroundColor Gray

# Esperar a que el servidor esté listo
if (-not (Wait-ForServer)) {
    Write-Host "❌ El servidor no respondió en el tiempo esperado" -ForegroundColor Red
    Stop-Process -InputObject $serverProcess -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "🧪 INICIANDO TESTS DE PREGUNTAS COMPLETAS" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Magenta

# Ejecutar tests
$results = @()
foreach ($question in $testQuestions) {
    $result = Test-BotQuestion -Question $question
    if ($result) {
        $results += $result
    }
    Start-Sleep -Seconds 1
}

# Resumen
Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "📊 RESUMEN DE TESTS" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Magenta

$successCount = @($results | Where-Object { $_ }).Count
Write-Host "✅ Tests exitosos: $successCount / $($testQuestions.Count)" -ForegroundColor Green

if ($results.Count -gt 0) {
    Write-Host ""
    Write-Host "Fases detectadas:" -ForegroundColor Cyan
    $results | Where-Object { $_ } | ForEach-Object { Write-Host "  • $($_.stage)" -ForegroundColor Yellow }
}

# Detener servidor
Write-Host ""
Write-Host "🛑 Deteniendo servidor..." -ForegroundColor Yellow
Stop-Process -InputObject $serverProcess -Force -ErrorAction SilentlyContinue

Write-Host "✅ Test completado" -ForegroundColor Green
