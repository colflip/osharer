// Minimal config server. Render deploys this as a Web Service.
// Exposes GET /config -> { "appId": "<AGORA_APP_ID from env>" }
const PORT = process.env.PORT || 3000;

console.log(`Config server listening on port ${PORT}`);
console.log(`AGORA_APP_ID is ${process.env.AGORA_APP_ID ? 'set' : 'NOT set'}`);

// Simple static server with /config endpoint
const http = require("http");

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    
    if (req.method === "GET" && url.pathname === "/config") {
        const appId = process.env.AGORA_APP_ID || "";
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ appId }));
        return;
    }
    
    res.writeHead(404);
    res.end("Not found");
});

server.listen(PORT, () => {
    console.log(`Config API ready at /config`);
});
