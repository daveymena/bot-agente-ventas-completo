import { spawn } from 'child_process';
import fetch from 'node-fetch';

const testQuestions = [
    "Hola, me interesa el megapack de piano",
    "¿Cuál es el precio del megapack?",
    "Me gustaría comprar un curso de idiomas",
    "¿Tienen planes de suscripción?",
    "Quiero los detalles del paquete de membresía",
    "¿Qué productos tienes disponibles?"
];

async function waitForServer(maxAttempts = 60) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch('http://localhost:3002/api/health');
            if (response.ok) {
                console.log('\n✅ Servidor listo\n');
                return true;
            }
        } catch (e) {
            process.stdout.write(`⏳ Esperando servidor... (${i + 1}/${maxAttempts})\r`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    return false;
}

async function testBotQuestion(question) {
    try {
        console.log(`\n❓ Pregunta: ${question}`);
        
        const phone = 'test-' + Date.now();
        const response = await fetch('http://localhost:3002/api/whatsapp/test-ia', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: question, phone: phone })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ Status: OK');
            console.log(`📋 Stage: ${result.stage}`);
            console.log(`💬 Respuesta: ${result.response}`);
            if (result.parts) {
                console.log(`📦 Partes: ${JSON.stringify(result.parts)}`);
            }
            return result;
        } else {
            console.log(`❌ Error: ${result.error || response.statusText}`);
            return null;
        }
    } catch (e) {
        console.log(`❌ Error: ${e.message}`);
        return null;
    }
}

async function main() {
    console.log('🤖 Iniciando test completo del bot...\n');
    
    // Iniciar servidor
    console.log('🚀 Iniciando servidor...');
    const serverProcess = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['run', 'dev'], {
        cwd: 'C:\\Users\\ADMIN\\Videos\\Agent-Sales-Bot',
        stdio: 'ignore',
        shell: true
    });
    
    console.log(`⏳ PID: ${serverProcess.pid}`);
    
    // Esperar a que el servidor esté listo
    if (!await waitForServer()) {
        console.log('❌ El servidor no respondió en el tiempo esperado');
        serverProcess.kill();
        process.exit(1);
    }
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🧪 INICIANDO TESTS DE PREGUNTAS COMPLETAS');
    console.log('═══════════════════════════════════════════════════════════');
    
    // Ejecutar tests
    const results = [];
    for (const question of testQuestions) {
        const result = await testBotQuestion(question);
        if (result) {
            results.push(result);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    
    // Resumen
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 RESUMEN DE TESTS');
    console.log('═══════════════════════════════════════════════════════════');
    
    console.log(`✅ Tests exitosos: ${results.filter(r => r).length} / ${testQuestions.length}`);
    
    if (results.length > 0) {
        console.log('\nFases detectadas:');
        const stages = new Set(results.filter(r => r?.stage).map(r => r.stage));
        stages.forEach(stage => console.log(`  • ${stage}`));
    }
    
    // Detener servidor
    console.log('\n🛑 Deteniendo servidor...');
    serverProcess.kill();
    
    console.log('✅ Test completado');
}

main().catch(console.error);
