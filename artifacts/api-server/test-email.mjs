import nodemailer from "nodemailer";
import dotenv from "dotenv";

// Cargar variables de entorno
dotenv.config();

console.log("🔍 Configuración de Email:");
console.log("SMTP_HOST:", process.env.SMTP_HOST);
console.log("SMTP_PORT:", process.env.SMTP_PORT);
console.log("SMTP_USER:", process.env.SMTP_USER);
console.log("SMTP_PASS:", process.env.SMTP_PASS ? "***" + process.env.SMTP_PASS.slice(-4) : "NO CONFIGURADO");
console.log("");

// Crear transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false, // true para 465, false para otros puertos
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  debug: true, // Mostrar logs de debug
  logger: true, // Mostrar logs
});

console.log("📡 Verificando conexión con servidor SMTP...");

// Verificar conexión
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Error conectando con SMTP:");
    console.error(error);
    process.exit(1);
  } else {
    console.log("✅ Conexión SMTP exitosa!");
    console.log("");
    
    // Enviar email de prueba
    console.log("📧 Enviando email de prueba...");
    
    const mailOptions = {
      from: `"VentasPro Test" <${process.env.SMTP_USER}>`,
      to: "daveymena16@gmail.com",
      subject: "🧪 Test de Email - VentasPro",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: Arial, sans-serif;
              background-color: #f5f5f5;
              padding: 20px;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              background: white;
              border-radius: 12px;
              padding: 30px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
            .header {
              background: linear-gradient(135deg, #f97316 0%, #fb923c 100%);
              color: white;
              padding: 20px;
              border-radius: 8px;
              text-align: center;
              margin-bottom: 20px;
            }
            .code {
              font-size: 36px;
              font-weight: bold;
              color: #f97316;
              text-align: center;
              letter-spacing: 8px;
              padding: 20px;
              background: #fef3c7;
              border-radius: 8px;
              margin: 20px 0;
            }
            .info {
              color: #666;
              line-height: 1.6;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚀 VentasPro</h1>
              <p>Test de Configuración de Email</p>
            </div>
            
            <div class="info">
              <p><strong>¡Email de prueba exitoso!</strong></p>
              <p>Si estás viendo este mensaje, significa que la configuración de email está funcionando correctamente.</p>
              
              <div class="code">123456</div>
              
              <p><strong>Configuración actual:</strong></p>
              <ul>
                <li>Servidor: ${process.env.SMTP_HOST}</li>
                <li>Puerto: ${process.env.SMTP_PORT}</li>
                <li>Usuario: ${process.env.SMTP_USER}</li>
                <li>Fecha: ${new Date().toLocaleString()}</li>
              </ul>
              
              <p>Ahora puedes usar el sistema de recuperación de contraseña sin problemas.</p>
            </div>
          </div>
        </body>
        </html>
      `,
    };
    
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("❌ Error enviando email:");
        console.error(error);
        process.exit(1);
      } else {
        console.log("✅ Email enviado exitosamente!");
        console.log("📬 Message ID:", info.messageId);
        console.log("📨 Response:", info.response);
        console.log("");
        console.log("🎉 ¡Todo funciona correctamente!");
        console.log("Revisa tu bandeja de entrada en: daveymena16@gmail.com");
        process.exit(0);
      }
    });
  }
});
