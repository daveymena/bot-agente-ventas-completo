#!/usr/bin/env node

/**
 * ChatGPT Bridge para VentasPro
 * 
 * Este script genera un token de sesión que ChatGPT puede usar
 * para conectarse a tu bot de WhatsApp via OpenAPI actions.
 * 
 * Uso:
 *   node chatgpt-bridge.mjs --login
 *   node chatgpt-bridge.mjs --token
 *   node chatgpt-bridge.mjs --test
 */

const BOT_URL = process.env.BOT_URL || "http://144.91.112.79:8080";
const EMAIL = process.env.BOT_EMAIL || "daveymena16@gmail.com";
const PASSWORD = process.env.BOT_PASSWORD || "6715320D.";

async function login() {
  console.log(`🔐 Logging in to ${BOT_URL}...`);
  
  const response = await fetch(`${BOT_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });

  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }

  const cookie = response.headers.get("set-cookie");
  if (!cookie) {
    throw new Error("No session cookie received");
  }

  console.log(`✅ Login successful`);
  return cookie.split(";")[0];
}

async function getConversations(cookie) {
  const response = await fetch(`${BOT_URL}/api/conversations`, {
    headers: { Cookie: cookie },
  });

  if (!response.ok) {
    throw new Error(`Failed to get conversations: ${response.status}`);
  }

  return response.json();
}

async function testConnection() {
  console.log("🧪 Testing connection...\n");

  try {
    // Test health
    const health = await fetch(`${BOT_URL}/api/health`);
    const healthData = await health.json();
    console.log("✅ Health:", healthData.status);
    console.log("   WhatsApp:", healthData.whatsapp?.conectado ? "Connected" : "Disconnected");

    // Test login
    const cookie = await login();
    console.log("   Session:", cookie.substring(0, 30) + "...");

    // Test conversations
    const conversations = await getConversations(cookie);
    console.log("   Conversations:", conversations.length);

    console.log("\n🎉 Connection test passed!");
    console.log("\n📋 To use in ChatGPT:");
    console.log("   1. Go to chat.openai.com");
    console.log("   2. Create a new GPT");
    console.log("   3. Add Action:", `${BOT_URL}/openai-plugin-manifest.json`);
    console.log("   4. Use session cookie for auth:", cookie);

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

async function generateToken() {
  const cookie = await login();
  console.log("\n🔑 Session Token (for ChatGPT Action auth):");
  console.log(cookie);
  console.log("\n📋 Add this to your ChatGPT Action as:");
  console.log("   Type: API Key");
  console.log("   Auth Type: Bearer (or Custom Header)");
  console.log("   Header: Cookie");
  console.log("   Value:", cookie);
}

// Parse args
const args = process.argv.slice(2);

if (args.includes("--login")) {
  login().then(console.log).catch(console.error);
} else if (args.includes("--token")) {
  generateToken().catch(console.error);
} else if (args.includes("--test")) {
  testConnection().catch(console.error);
} else {
  console.log(`
VentasPro ChatGPT Bridge

Usage:
  node chatgpt-bridge.mjs --test     Test connection to bot
  node chatgpt-bridge.mjs --token    Generate session token for ChatGPT
  node chatgpt-bridge.mjs --login    Just login and print cookie

Environment:
  BOT_URL      Bot URL (default: http://144.91.112.79:8080)
  BOT_EMAIL    Login email
  BOT_PASSWORD Login password
  `);
}
