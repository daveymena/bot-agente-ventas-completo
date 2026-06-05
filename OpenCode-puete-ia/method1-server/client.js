#!/usr/bin/env node
/**
 * Cliente Node.js para OpenCode Server
 * Permite usar los modelos gratuitos de OpenCode desde aplicaciones externas
 */

const axios = require('axios');

class OpenCodeClient {
  /**
   * Inicializa el cliente de OpenCode
   * @param {string} baseUrl - URL base del servidor OpenCode
   * @param {string} password - Password si el servidor tiene autenticación
   * @param {number} timeout - Timeout para las peticiones en ms
   */
  constructor(baseUrl = 'http://localhost:4096', password = null, timeout = 30000) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.timeout = timeout;
    
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: this.timeout,
      ...(password && {
        auth: {
          username: 'opencode',
          password: password
        }
      })
    });
  }

  /**
   * Verifica el estado del servidor OpenCode
   * @returns {Promise<Object>} Estado del servidor
   */
  async checkStatus() {
    try {
      const response = await this.client.get('/api/status');
      return { ...response.data, connected: true };
    } catch (error) {
      return { 
        error: error.message, 
        connected: false 
      };
    }
  }

  /**
   * Lista los modelos disponibles
   * @returns {Promise<Object>} Lista de modelos
   */
  async listModels() {
    try {
      const response = await this.client.get('/api/models');
      return response.data;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * Envía un mensaje al modelo de OpenCode
   * @param {string} message - Mensaje a enviar
   * @param {string} sessionId - ID de sesión para mantener contexto
   * @param {boolean} stream - Si true, retorna un stream
   * @returns {Promise<string>} Respuesta del modelo
   */
  async chat(message, sessionId = null, stream = false) {
    const payload = {
      message: message,
      stream: stream
    };

    if (sessionId) {
      payload.session_id = sessionId;
    }

    try {
      const response = await this.client.post('/api/chat', payload, {
        ...(stream && { responseType: 'stream' })
      });

      if (stream) {
        return response.data; // Retorna el stream
      } else {
        return response.data.response || response.data.message || JSON.stringify(response.data);
      }
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }

  /**
   * Envía un prompt directo al modelo
   * @param {string} prompt - Prompt a enviar
   * @param {Object} context - Contexto adicional
   * @returns {Promise<string>} Respuesta del modelo
   */
  async prompt(prompt, context = null) {
    const payload = { prompt };

    if (context) {
      payload.context = context;
    }

    try {
      const response = await this.client.post('/api/prompt', payload);
      return response.data.response || JSON.stringify(response.data);
    } catch (error) {
      return `Error: ${error.message}`;
    }
  }

  /**
   * Crea una nueva sesión para mantener contexto
   * @returns {Promise<string|null>} ID de la sesión creada
   */
  async createSession() {
    try {
      const response = await this.client.post('/api/session/new');
      return response.data.session_id;
    } catch (error) {
      console.error(`Error creando sesión: ${error.message}`);
      return null;
    }
  }

  /**
   * Maneja respuestas en streaming
   * @param {Stream} stream - Stream de respuesta
   * @param {Function} onChunk - Callback para cada chunk
   * @returns {Promise<void>}
   */
  async handleStream(stream, onChunk) {
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        try {
          const data = JSON.parse(chunk.toString());
          if (data.chunk) {
            onChunk(data.chunk);
          } else if (data.message) {
            onChunk(data.message);
          }
        } catch (e) {
          // Puede ser texto plano
          onChunk(chunk.toString());
        }
      });

      stream.on('end', resolve);
      stream.on('error', reject);
    });
  }
}

// Ejemplo de uso
async function main() {
  // Crear cliente
  const client = new OpenCodeClient();

  // Verificar conexión
  console.log('🔍 Verificando conexión con OpenCode Server...');
  const status = await client.checkStatus();

  if (!status.connected) {
    console.log('❌ No se pudo conectar al servidor OpenCode');
    console.log('   Asegúrate de que \'opencode serve\' esté corriendo');
    process.exit(1);
  }

  console.log('✅ Conectado exitosamente');
  console.log('   Estado:', JSON.stringify(status, null, 2));

  // Listar modelos
  console.log('\n📋 Modelos disponibles:');
  const models = await client.listModels();
  console.log(JSON.stringify(models, null, 2));

  // Crear sesión
  console.log('\n🆕 Creando sesión...');
  const sessionId = await client.createSession();
  console.log(`   Session ID: ${sessionId}`);

  // Enviar mensaje
  console.log('\n💬 Enviando mensaje...');
  const message = 'Explica qué es una función lambda en JavaScript en 2 líneas';
  const response = await client.chat(message, sessionId);
  console.log(`   Pregunta: ${message}`);
  console.log(`   Respuesta: ${response}`);

  // Ejemplo con streaming
  console.log('\n🌊 Ejemplo con streaming:');
  const messageStream = 'Cuenta del 1 al 5';
  console.log(`   Pregunta: ${messageStream}`);
  process.stdout.write('   Respuesta: ');

  const stream = await client.chat(messageStream, sessionId, true);
  await client.handleStream(stream, (chunk) => {
    process.stdout.write(chunk);
  });
  console.log();
}

// Ejecutar si es el archivo principal
if (require.main === module) {
  main().catch(console.error);
}

module.exports = OpenCodeClient;
