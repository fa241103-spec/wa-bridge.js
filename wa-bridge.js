/**
 * ====================================================================================================
 * JEMBATAN WHATSAPP (MULTI-BUBBLE HUMAN RHYTHM) - PT. PLATINUM MADANI SEJAHTERA (PMS)
 * Versi Sistem: v8.9.8+ (Live Production Build)
 * Fitur: Jeda Ketik Manusiawi (2.5 - 4 Detik) + Anti-Dobel + Vision Struk
 * ====================================================================================================
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const pino = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');

let latestQrDataUrl = null;
let connectionStatus = 'WAITING_QR';
let connectedPhone = null;

const chatHistoryMap = new Map();
const messageDebounceQueue = new Map();

// 1. Web Server Lokal untuk Barcode QR (Port 3300)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  if (connectionStatus === 'CONNECTED') {
    res.end(`<!DOCTYPE html><html><body style="background:#050b14;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;text-align:center;">
      <div style="background:#0f172a;border:2px solid #10b981;border-radius:24px;padding:40px;"><div style="font-size:50px;">✅</div><h2 style="color:#10b981;">WHATSAPP TERHUBUNG!</h2>
      <p>Nomor: <b>+${connectedPhone}</b></p></div></body></html>`);
    return;
  }
  if (latestQrDataUrl) {
    res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="20"></head><body style="background:#050b14;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;text-align:center;">
      <div style="background:#0f172a;border:2px solid #38bdf8;border-radius:24px;padding:30px;"><h2 style="color:#38bdf8;">📱 TAUTKAN WHATSAPP DIREKSI</h2>
      <div style="background:#fff;padding:12px;border-radius:16px;display:inline-block;margin:15px 0;"><img src="${latestQrDataUrl}" style="width:260px;height:260px;display:block;"></div></div></body></html>`);
    return;
  }
  res.end(`<!DOCTYPE html><html><head><meta http-equiv="refresh" content="3"></head><body style="background:#050b14;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;text-align:center;"><h2>⏳ Menyiapkan Barcode WhatsApp...</h2></body></html>`);
});

server.listen(3300, () => {
  console.log('\n🌐 KURIR MULTI-BUBBLE AKTIF DI: http://localhost:3300');
});

function getPathGambarQris() {
  const possiblePaths = [
    path.join(__dirname, 'qris.png'),
    path.join(__dirname, 'qris.jpg'),
    path.join(process.cwd(), 'qris.png'),
    path.join(process.cwd(), 'qris.jpg')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// 2. Mesin Baileys
async function startWaBridge() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: true
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      connectionStatus = 'WAITING_QR';
      latestQrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
    }

    if (connection === 'open') {
      connectionStatus = 'CONNECTED';
      latestQrDataUrl = null;
      const userJid = sock.user?.id || '';
      connectedPhone = userJid.split(':')[0] || userJid.split('@')[0];
      console.log(`\n🎉 ALHAMDULILLAH! WHATSAPP TERHUBUNG: +${connectedPhone}`);
      console.log('💬 RITME KETIK MANUSIAWI AKTIF (JEDA ALAMI 2.5 - 4 DETIK)!');
    }

    if (connection === 'close') {
      connectionStatus = 'DISCONNECTED';
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) setTimeout(startWaBridge, 3000);
    }
  });

  sock.ev.on('messages.upsert', async (upsertData) => {
    const messages = upsertData.messages || [];

    for (const msg of messages) {
      const jid = msg.key?.remoteJid;
      if (!jid || jid.includes('@broadcast') || jid.includes('@g.us')) continue;
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const isFoto = !!(msg.message.imageMessage);
      const text = (msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption || '').trim();

      let base64Gambar = null;
      if (isFoto) {
        try {
          const buffer = await downloadMediaMessage(msg, 'buffer', {});
          if (buffer) {
            base64Gambar = buffer.toString('base64');
            console.log(`📸 [GAMBAR DITERIMA]: Foto dari ${jid.split('@')[0]}`);
          }
        } catch (err) {
          console.warn('[DOWNLOAD FOTO WARNING]:', err.message);
        }
      }

      if (!text && !base64Gambar) continue;

      const namaTamu = msg.pushName || 'Kak';
      const noHpTamu = jid.split('@')[0];

      // Antrean Debounce Anti-Dobel
      if (!messageDebounceQueue.has(jid)) {
        messageDebounceQueue.set(jid, {
          timer: null,
          texts: [],
          images: [],
          namaTamu,
          noHpTamu
        });
      }

      const antrean = messageDebounceQueue.get(jid);
      if (text) antrean.texts.push(text);
      if (base64Gambar) antrean.images.push(base64Gambar);

      if (antrean.timer) clearTimeout(antrean.timer);

      antrean.timer = setTimeout(async () => {
        messageDebounceQueue.delete(jid);

        const gabunganTeks = antrean.texts.join('\n').trim() || '[FOTO TERKIRIM] Tamu mengirimkan foto';
        const gambarTerkirim = antrean.images;

        console.log(`\n📩 CHAT MASUK DARI ${antrean.namaTamu} (+${antrean.noHpTamu}): "${gabunganTeks}"`);

        try {
          const riwayat = chatHistoryMap.get(jid) || [];

          const webhookUrl = 'https://aplikasi-portal-pms-new.vercel.app/api/wa-webhook';
          const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: gabunganTeks,
              from: antrean.noHpTamu,
              pushName: antrean.namaTamu,
              history: riwayat,
              images: gambarTerkirim.map(b64 => ({ mimeType: 'image/jpeg', data: b64 }))
            })
          });

          const result = await response.json();

          if (result.success && result.balasan) {
            let pesanMentah = result.balasan;
            const mintaKirimGambarQris = pesanMentah.includes('[KIRIM_GAMBAR_QRIS]');
            pesanMentah = pesanMentah.replace('[KIRIM_GAMBAR_QRIS]', '').trim();

            riwayat.push({ role: 'user', text: gabunganTeks });
            riwayat.push({ role: 'assistant', text: pesanMentah });
            if (riwayat.length > 8) riwayat.splice(0, 2);
            chatHistoryMap.set(jid, riwayat);

            const balonPesan = pesanMentah
              .split('|||')
              .map(b => b.trim())
              .filter(b => b.length > 0);

            // Kirim gambar QRIS jika diminta
            const jalurQris = getPathGambarQris();
            if (mintaKirimGambarQris && jalurQris) {
              await sock.sendMessage(jid, {
                image: fs.readFileSync(jalurQris),
                caption: 'Ini Barcode QRIS resmi kami yaa kak, silakan di-scan 😊'
              });
              await new Promise(r => setTimeout(r, 2000));
            }

            // =========================================================================================
            // RITME MENGETIK MANUSIAWI LEBIH LAMA SEDIKIT (2.5 - 4 DETIK)
            // =========================================================================================
            for (let i = 0; i < balonPesan.length; i++) {
              await sock.sendPresenceUpdate('composing', jid);
              
              // Jeda mengetik realistis: 2.200 ms s.d 3.800 ms
              const jedaKetik = 2200 + Math.floor(Math.random() * 1600);
              await new Promise(r => setTimeout(r, jedaKetik));

              await sock.sendMessage(jid, { text: balonPesan[i] });
              console.log(`💬 BALON ${i + 1}/${balonPesan.length} TERKIRIM: "${balonPesan[i]}"`);
            }
          }

          await sock.sendPresenceUpdate('available', jid);
        } catch (err) {
          console.error('[GAGAL OPER KE VERCEL]:', err.message);
        }
      }, 2000);
    }
  });
}

startWaBridge().catch(err => console.error('[FATAL ERROR]:', err));