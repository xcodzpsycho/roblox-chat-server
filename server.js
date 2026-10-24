const { WebSocketServer } = require('ws');
const wss = new WebSocketServer({ port: process.env.PORT || 8080 });

let clients = new Map(); // Speichert ws -> { userId, username }
let slowmodeUsers = new Map(); // Für den 5-Sekunden-Slowmode
let chatLocked = false;

// Whitelisted Admin UserIDs
const ADMIN_IDS = [1969719705]; 

// Dein Discord Webhook Link
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1563608183103033384/xlawX6_5g3y92zDOlROQOi2encDZhlTcq1VP61wktqEdO6Pn6rhRQQywLWXt9zHLIQZj";

// Funktion, um Nachrichten an Discord zu senden
async function sendToDiscord(username, text) {
    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: `**[Roblox] ${username}**: ${text}`
            })
        });
    } catch (error) {
        console.error("Fehler beim Senden an Discord:", error);
    }
}

wss.on('connection', (ws) => {
    let clientData = { userId: null, username: "Unknown" };

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            return;
        }

        // 1. Initialisierung beim Verbinden
        if (data.type === 'init') {
            clientData.userId = data.userId;
            clientData.username = data.username;
            clients.set(ws, clientData);
            broadcastPlayerList();
            return;
        }

        // 2. "Schreibt..."-Status weiterleiten
        if (data.type === 'typing') {
            broadcast({ type: 'typing', username: clientData.username, isTyping: data.isTyping });
            return;
        }

        // 3. Nachrichten senden
        if (data.type === 'chat') {
            if (chatLocked && !ADMIN_IDS.includes(clientData.userId)) {
                ws.send(JSON.stringify({ type: 'system', message: 'Der Chat ist gesperrt.' }));
                return;
            }

            // Slowmode-Prüfung (5 Sekunden)
            let now = Date.now();
            if (!ADMIN_IDS.includes(clientData.userId) && slowmodeUsers.has(clientData.userId)) {
                let timeLeft = (slowmodeUsers.get(clientData.userId) - now) / 1000;
                if (timeLeft > 0) {
                    ws.send(JSON.stringify({ type: 'system', message: `Slowmode aktiv! Warte noch ${Math.ceil(timeLeft)} Sekunden.` }));
                    return;
                }
            }
            if (!ADMIN_IDS.includes(clientData.userId)) {
                slowmodeUsers.set(clientData.userId, now + 5000);
            }

            // Einfacher Wortfilter
            let text = data.text;
            const badWords = ["nigga", "nga", "nger", "niga", "niger", "nigger", "nicker", "nicka", "nikka", "nikker", "nig", "niggi", "nigi"];
            badWords.forEach(word => {
                let regex = new RegExp(word, 'gi');
                text = text.replace(regex, '***');
            });

            let msgId = Math.random().toString(36).substring(2, 9);
            
            // An alle Roblox-Spieler im WebSocket senden
            broadcast({
                type: 'chat',
                id: msgId,
                userId: clientData.userId,
                username: clientData.username,
                text: text,
                replyTo: data.replyTo || null
            });

            // 🚀 NEU: Nachricht direkt an Discord Webhook schicken!
            sendToDiscord(clientData.username, text);
        }

        // 4. Nachrichten löschen
        if (data.type === 'delete') {
            broadcast({ type: 'delete', id: data.id, deleter: clientData.username });
        }

        // 5. Admin Befehle
        if (data.type === 'admin_cmd' && ADMIN_IDS.includes(clientData.userId)) {
            if (data.cmd === 'lock') {
                chatLocked = true;
                broadcast({ type: 'system', message: '⚠️ Der Chat wurde von einem Admin gesperrt.' });
            } else if (data.cmd === 'unlock') {
                chatLocked = false;
                broadcast({ type: 'system', message: '✅ Der Chat wurde entsperrt.' });
            }
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        broadcastPlayerList();
    });
});

function broadcast(data) {
    const messageString = JSON.stringify(data);
    clients.forEach((_, ws) => {
        if (ws.readyState === 1) ws.send(messageString);
    });
}

function broadcastPlayerList() {
    let playerList = [];
    clients.forEach((data) => {
        playerList.push({ username: data.username, userId: data.userId });
    });
    broadcast({ type: 'playerlist', players: playerList });
}

console.log("WebSocket Server läuft...");
