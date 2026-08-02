/* ═══════════════════════════════════════════════════════════════
   XParfum · Configuración
   ═══════════════════════════════════════════════════════════════ */

// ── Firebase (proyecto xparfum-38673) ──
export const firebaseConfig = {
  apiKey: "AIzaSyC-STnunexDEUWMPMXyt9TPbZ-_JignaHk",
  authDomain: "xparfum-38673.firebaseapp.com",
  projectId: "xparfum-38673",
  storageBucket: "xparfum-38673.firebasestorage.app",
  messagingSenderId: "92123579036",
  appId: "1:92123579036:web:647e2c1f20949a33782359",
};

// ── WhatsApp al que llegan los pedidos de la tienda ──
// Formato internacional sin "+" ni espacios. Ej: 584146039842
export const WHATSAPP_NUMERO = "584146039842";

// ── Cloudinary (fotos de productos desde el admin) ──
// Las fotos migradas de la tienda anterior siguen sirviéndose desde el
// Cloudinary previo; las nuevas subidas van a esta cuenta.
export const CLOUDINARY_CONFIG = {
  cloudName: "xparfum",
  uploadPreset: "jtdqewim",
  folder: "perfumes",
};
