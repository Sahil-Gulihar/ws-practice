const express = require("express");
const { createServer } = require("node:http");
const { join } = require("node:path");
const { Server } = require("socket.io");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

async function main() {
  const db = await open({
    filename: "chat.db",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_offset TEXT UNIQUE,
        content TEXT
    );
  `);

  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    connectionStateRecovery: {},
  });

  app.get("/", (req, res) => {
    res.sendFile(join(__dirname, "index.html"));
  });

  io.on("connection", (socket) => {
    if (!socket.recovered) {
      try {
        const lastReceivedId = socket.handshake.auth.serverOffset || 0;
        db.each(
          "SELECT id, content FROM messages WHERE id > ?",
          [lastReceivedId],
          (_err, row) => {
            socket.emit("chat message", row.content, row.id);
          }
        );
      } catch (e) {}
    }
    socket.on("chat message", async (msg, clientOffset, callback) => {
      let result;
      try {
        result = await db.run(
          "INSERT INTO messages (content, client_offset) VALUES (?, ?)",
          msg,
          clientOffset
        );
      } catch (e) {
        // TODO handle the failure
        if (e.errno === 19) {
          callback();
        } else {
          console.log("retrying connection");
        }
        return;
      }
      io.emit("chat message", msg, result.lastID);

      callback();
    });
  });

  server.listen(3000, () => {
    console.log(`server running at 3000`);
  });
}

main();
