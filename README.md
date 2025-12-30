# Real-Time Collaborative Code Editor

A full-stack real-time collaborative coding platform that allows multiple users to write, execute, and discuss code together in shared rooms. The application supports real-time synchronization, role-based access control, chat, and multi-language code execution using WebSockets.



## 🚀 Features

 **Real-time code collaboration** using Socket.IO
 **Role-based access control** (Owner / Editor / Viewer)
 **Built-in chat** with typing indicators
 **Multi-language code execution** (JavaScript, Python, Java, C++)
 **Standard input support**
 **Monaco Editor** for a VS Code–like coding experience


## 🛠️ Tech Stack

### Frontend
- React.js
- Monaco Editor
- Socket.IO Client
- CSS (Flexbox layout)

### Backend
- Node.js
- Express.js
- Socket.IO
- Remote Code Execution API (Piston)

## ⚙️ How It Works

1. Users join a shared room using a Room ID.
2. Code edits, language changes, and chat messages are synchronized in real time via WebSockets.
3. Role-based permissions restrict editing and code execution.
4. Code execution requests are sent to a remote execution engine.
5. Execution output (stdout and stderr) is returned and displayed in the editor UI.

## 🔐 Roles & Permissions

| Role   | Edit Code | Run Code | Change Roles |
|-------|-----------|----------|--------------|
| Owner | ✅ | ✅ | ✅ |
| Editor | ✅ | ✅ | ❌ |
| Viewer | ❌ | ❌ | ❌ |


## 📦 Setup Instructions

### 1️⃣ Clone the repository
```bash
git clone https://github.com/your-username/real-time-code-editor.git
cd real-time-code-editor
