import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import { io } from "socket.io-client";
import Editor from "@monaco-editor/react";

const socket = io("http://localhost:5000");

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");

  const [users, setUsers] = useState([]);
  const [socketId, setSocketId] = useState("");

  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("// start coding...");
  const [stdin, setStdin] = useState("");
  const [output, setOutput] = useState("");

  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");

  const [typing, setTyping] = useState("");
  const typingTimeoutRef = useRef(null);

  /* ---------- ROLE ---------- */
  const myRole =
    users.find((u) => u.id === socketId)?.role || "viewer";

  /* ---------- SOCKETS ---------- */
  useEffect(() => {
    socket.off();

    socket.on("joined", ({ socketId }) => setSocketId(socketId));
    socket.on("userList", setUsers);
    socket.on("codeUpdate", setCode);
    socket.on("languageUpdate", setLanguage);

    socket.on("userTyping", (name) => {
      if (name !== userName) {
        setTyping(`${name.slice(0, 8)}... is typing`);
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTyping(""), 2000);
      }
    });

    socket.on("chatMessage", (msg) =>
      setMessages((m) => [...m, msg])
    );

    socket.on("codeResponse", (res) => {
      if (res?.run) {
        const { stdout, stderr, output } = res.run;
        const blocks = [];
        if (stdout) blocks.push("----- stdout -----\n" + stdout);
        if (stderr) blocks.push("----- stderr -----\n" + stderr);
        if (output) blocks.push("----- output -----\n" + output);
        setOutput(blocks.join("\n\n"));
      } else if (res?.error) {
        setOutput(`Error:\n${res.error}`);
      } else {
        setOutput(JSON.stringify(res, null, 2));
      }
    });

    return () => socket.off();
  }, [userName]);

  /* ---------- JOIN / LEAVE ---------- */
  const joinRoom = () => {
    if (!roomId || !userName) return;
    socket.emit("join", { roomId, userName });
    setJoined(true);
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomId("");
    setUserName("");
    setUsers([]);
  };

  /* ---------- CODE ---------- */
  const handleCodeChange = (val) => {
    if (myRole === "viewer") return;
    setCode(val);
    socket.emit("codeChange", { roomId, code: val });
    socket.emit("typing", { roomId, userName });
  };

  const runCode = () => {
    if (myRole === "viewer") return;
    socket.emit("compileCode", {
      roomId,
      code,
      language,
      input: stdin,
    });
  };

  /* ---------- LANGUAGE (FIXED) ---------- */
  const handleLanguageChange = (e) => {
    if (myRole === "viewer") return;

    const newLanguage = e.target.value;
    setLanguage(newLanguage);

    socket.emit("languageChange", {
      roomId,
      language: newLanguage,
    });
  };

  /* ---------- CHAT ---------- */
  const sendChat = () => {
    if (!chatInput.trim()) return;
    socket.emit("chatMessage", {
      roomId,
      user: userName,
      message: chatInput,
    });
    setChatInput("");
  };

  const changeRole = (targetId, role) => {
    socket.emit("changeRole", { roomId, targetId, role });
  };

  /* ---------- JOIN UI ---------- */
  if (!joined) {
    return (
      <div className="join-container">
        <div className="join-form">
          <h1>Join Code Room</h1>

          <input
            placeholder="Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          />

          <input
            placeholder="Your Name"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
          />

          <button onClick={joinRoom}>Join</button>
        </div>
      </div>
    );
  }

  /* ---------- MAIN UI ---------- */
  return (
    <div className="editor-container">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="room-info">
          <h3>Room ID</h3>
          <div className="room-id-box">{roomId}</div>
          <button
            className="copy-button"
            onClick={() => navigator.clipboard.writeText(roomId)}
          >
            Copy Room ID
          </button>
        </div>

        <h3>Users</h3>
        <ul>
          {users.map((u) => (
            <li key={u.id}>
              {u.name} — <strong>{u.role}</strong>
              {myRole === "owner" && u.id !== socketId && (
                <select
                  value={u.role}
                  onChange={(e) =>
                    changeRole(u.id, e.target.value)
                  }
                >
                  <option value="editor">editor</option>
                  <option value="viewer">viewer</option>
                </select>
              )}
            </li>
          ))}
        </ul>

        <h3>Chat</h3>
        <div className="sidebar-chat">
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i}>
                <strong>{m.user}:</strong> {m.message}
              </div>
            ))}
          </div>

          <input
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Type a message..."
          />

          <button onClick={sendChat}>Send</button>
        </div>

        <p className="typing-indicator">{typing}</p>

        <select
          className="language-selector"
          value={language}
          onChange={handleLanguageChange}
          disabled={myRole === "viewer"}
        >
          <option value="javascript">JavaScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
        </select>

        <button className="leave-button" onClick={leaveRoom}>
          Leave Room
        </button>
      </div>

      {/* EDITOR */}
      <div className="editor-wrapper">
        <div className="editor-area">
          <Editor
            height="100%"
            language={language}
            value={code}
            onChange={handleCodeChange}
            theme="vs-dark"
            options={{
              readOnly: myRole === "viewer",
              minimap: { enabled: false },
            }}
          />
        </div>

        <div className="controls-panel">
          <textarea
            className="stdin-input"
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="Standard input"
          />

          <button
            className="run-button"
            onClick={runCode}
            disabled={myRole === "viewer"}
          >
            Run
          </button>

          <textarea
            className="output-console"
            value={output}
            readOnly
          />
        </div>
      </div>
    </div>
  );
};

export default App;






