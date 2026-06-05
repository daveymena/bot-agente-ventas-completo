# Test REAL de mensaje de WhatsApp
# Este script simula un mensaje entrante de WhatsApp para probar el sistema completo

$apiUrl = "http://localhost:3002/api/whatsapp/test-ia"
$testMessage = "Hola, me interesa aprender piano"
$testPhone = "+573001234567"  # Número de prueba

$body = @{
    message = $testMessage
} | ConvertTo-Json -Depth 10

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST REAL DE WHATSAPP" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Telefono: $testPhone" -ForegroundColor Green
Write-Host "Mensaje: $testMessage" -ForegroundColor Green
Write-Host "URL: $apiUrl" -ForegroundColor Green
Write-Host ""
Write-Host "Enviando mensaje..." -ForegroundColor Yellow
Write-Host ""

try {
    $response = Invoke-WebRequest -Uri $apiUrl -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "RESPUESTA RECIBIDA" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host ""
    Write-Host "Respuesta:" -ForegroundColor Yellow
    $response.Content | ConvertFrom-Json | ConvertTo-Json -Depth 10 | Write-Host
    Write-Host ""
    
} catch {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "ERROR" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $reader.BaseStream.Position = 0
        $reader.DiscardBufferedData()
        $responseBody = $reader.ReadToEnd()
        Write-Host "Detalles:" -ForegroundColor Yellow
        Write-Host $responseBody -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "INSTRUCCIONES PARA VERIFICAR:" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Revisa los logs del servidor API" -ForegroundColor White
Write-Host "2. Verifica que se creo una conversacion nueva" -ForegroundColor White
Write-Host "3. Verifica que se selecciono el agente correcto (Valentina para piano)" -ForegroundColor White
Write-Host "4. Verifica que se encontro el producto en el catalogo (ID: 311)" -ForegroundColor White
Write-Host "5. Verifica que la respuesta incluye [CARD: 311]" -ForegroundColor White
Write-Host "6. Verifica el formato de la tarjeta de producto" -ForegroundColor White
Write-Host ""
