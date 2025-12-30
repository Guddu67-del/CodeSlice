import express from "express";
import http from "http";
import { Server } from "socket.io";
import path from "path";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// rooms is a Map<roomId, { users: Map<socketId, userName>, roles: Map<socketId, role>, code: string, language: string, version: string, output: string }>
const rooms = new Map();

io.on("connection", (socket) => {
  console.log("User Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  socket.on("join", ({ roomId, userName }) => {
    currentRoom = roomId.trim();
    currentUser = userName.trim();
    socket.join(currentRoom);

    if (!rooms.has(currentRoom)) {
      rooms.set(currentRoom, {
        users: new Map(),
        roles: new Map(),
        code: "// start code here",
        language: "javascript",
        version: "*",
        output: "",
      });
    }

    const room = rooms.get(currentRoom);
    room.users.set(socket.id, currentUser);

    // assign role: first user -> owner, otherwise editor by default
    if (!room.roles.has(socket.id)) {
      const isFirst = room.users.size === 1;
      room.roles.set(socket.id, isFirst ? "owner" : "editor");
    }

    // Build user list with roles
    const userList = Array.from(room.users.entries()).map(([id, name]) => ({
      id,
      name,
      role: room.roles.get(id) || "viewer",
    }));

    // Send current code and language to the newly joined socket
    socket.emit("codeUpdate", room.code);
    socket.emit("languageUpdate", room.language);
    socket.emit("joined", { socketId: socket.id });

    // Broadcast updated list to everyone in the room (including the newly joined user)
    io.to(currentRoom).emit("userList", userList);
    io.to(currentRoom).emit("userJoined", userList.map(u => u.name));

    console.log(`Room ${currentRoom} now has:`, userList.map(u => u.name));
  });

  socket.on("codeChange", ({ roomId, code }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const role = room.roles.get(socket.id) || "viewer";
    if (role === "viewer") return; // viewers cannot change code
    room.code = code;
    socket.to(roomId).emit("codeUpdate", code);
  });

  socket.on("typing", ({ roomId, userName }) => {
    socket.to(roomId).emit("userTyping", userName);
  });

  socket.on("languageChange", ({ roomId, language }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const role = room.roles.get(socket.id) || "viewer";
    if (role === "viewer") return; // viewers cannot change language
    room.language = language;
    io.to(roomId).emit("languageUpdate", language);
  });

  socket.on(
    "compileCode",
    async ({ code, roomId, language, version, input }) => {
      if (!rooms.has(roomId)) return;
      const room = rooms.get(roomId);
      const role = room.roles.get(socket.id) || "viewer";
      if (role === "viewer") {
        return socket.emit("codeResponse", { error: "Permission denied" });
      }
      // ensure version is a string (Piston requires a version string)
      const ver = typeof version === 'string' && version.trim() ? version : (room.version || "*");
      try {
        // dynamic import to ensure axios is available at runtime
        const axiosModule = await import("axios");
        const axiosClient = axiosModule.default || axiosModule;

        // retry/backoff configuration
        const maxAttempts = 3;
        const baseDelay = 500; // ms
        let lastError = null;
        let response = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            response = await axiosClient.post(
              "https://emkc.org/api/v2/piston/execute",
              {
                language,
                version: ver,
                files: [
                  {
                    content: code,
                  },
                ],
                stdin: input || "",
              },
              {
                timeout: 15000,
                headers: { "Content-Type": "application/json" },
              }
            );
            // success
            break;
          } catch (errAttempt) {
            lastError = errAttempt;
            const isLast = attempt === maxAttempts;
            console.warn(`Piston request attempt ${attempt} failed${isLast ? " (final)" : ""}:`, errAttempt && errAttempt.message ? errAttempt.message : errAttempt);
            if (isLast) break;
            // exponential backoff
            const delay = baseDelay * Math.pow(2, attempt - 1);
            await new Promise((r) => setTimeout(r, delay));
          }
        }

        if (!response) throw lastError || new Error("No response from executor after retries");

        room.output = response.data?.run?.output || "";
        io.to(roomId).emit("codeResponse", response.data);
      } catch (err) {
        // Build a clearer error message for the client
        let message = "Unknown error";
        const details = {};
        if (err && err.response) {
          // Server responded with non-2xx
          details.status = err.response.status;
          details.data = err.response.data;
          message = `Executor responded with status ${err.response.status}`;
        } else if (err && err.request) {
          // No response received
          message = "No response from executor (network error or blocked)";
          details.code = err.code || null;
        } else if (err && err.message) {
          message = err.message;
        }

        console.error("compileCode error:", message, details, err && err.stack ? err.stack : err);
        io.to(roomId).emit("codeResponse", {
          error: message,
          details,
        });
      }
    }
  );

  // Chat messaging
  socket.on("chatMessage", ({ roomId, message }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const userName = room.users.get(socket.id) || "Unknown";
    const payload = { user: userName, message, time: Date.now() };
    io.to(roomId).emit("chatMessage", payload);
  });

  // Role change 
  socket.on("changeRole", ({ roomId, targetId, role }) => {
    if (!rooms.has(roomId)) return;
    const room = rooms.get(roomId);
    const requesterRole = room.roles.get(socket.id) || "viewer";
    if (requesterRole !== "owner") return;
    if (!room.users.has(targetId)) return;
    room.roles.set(targetId, role);
    const userList = Array.from(room.users.entries()).map(([id, name]) => ({
      id,
      name,
      role: room.roles.get(id) || "viewer",
    }));
    io.to(roomId).emit("userList", userList);
  });

  socket.on("leaveRoom", () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.users.delete(socket.id);
      const userNames = Array.from(room.users.values());
      io.to(currentRoom).emit("userJoined", userNames);
      if (room.users.size === 0) rooms.delete(currentRoom);
      socket.leave(currentRoom);
      currentRoom = null;
      currentUser = null;
    }
  });

  socket.on("disconnect", () => {
    if (currentRoom && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.users.delete(socket.id);
      const userNames = Array.from(room.users.values());
      io.to(currentRoom).emit("userJoined", userNames);
      if (room.users.size === 0) rooms.delete(currentRoom);
      socket.leave(currentRoom);
    }
    console.log("User Disconnected", socket.id);
  });
});

const port = process.env.PORT || 5000;
const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "/Frontend/dist")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "dist", "index.html"));
});

app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "Frontend", "dist", "index.html"));
});

// executor connectivity test (useful for diagnostics)
app.get("/exec-test", async (req, res) => {
  try {
    const axiosModule = await import("axios");
    const axiosClient = axiosModule.default || axiosModule;
    const response = await axiosClient.post(
      "https://emkc.org/api/v2/piston/execute",
      {
        language: "javascript",
        version: "*",
        files: [{ content: "console.log('ping')" }],
      },
      { timeout: 10000 }
    );
    res.json({ ok: true, status: response.status, data: response.data });
  } catch (err) {
    const details = {};
    if (err && err.response) {
      details.status = err.response.status;
      details.data = err.response.data;
    } else if (err && err.request) {
      details.code = err.code || null;
    }
    res.status(502).json({ ok: false, message: err.message || "error", details });
  }
});

server.listen(port, () => {
  console.log("server is working on port", port);
});
