const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Socket.IO with polling first for ngrok
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["polling", "websocket"]
});

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Create new room
app.get("/new-room", (req, res) => {
  const roomId = Math.random().toString(36).substring(2, 8);
  res.redirect(`/room/${roomId}`);
});

// Serve room page
app.get("/room/:roomId", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// Store rooms
const rooms = {};

io.on("connection", (socket) => {
  console.log("✅ User connected:", socket.id);
  let currentRoom = null;

  socket.on("join-room", (roomId) => {
    // Leave previous room
    if (currentRoom) {
      socket.leave(currentRoom);
    }
    
    socket.join(roomId);
    currentRoom = roomId;
    
    // Initialize room
    if (!rooms[roomId]) {
      rooms[roomId] = {
        users: [],
        initiator: null
      };
    }
    
    const room = rooms[roomId];
    
    // Add user if not already in room
    if (!room.users.includes(socket.id)) {
      room.users.push(socket.id);
    }
    
    console.log(`📍 Room ${roomId}: ${room.users.length}/2 users`);
    
    // Assign roles - FIRST user is initiator
    if (room.users.length === 1) {
      room.initiator = socket.id;
      socket.emit("role", "initiator");
      console.log(`🎮 User ${socket.id} is INITIATOR`);
    } else {
      socket.emit("role", "joiner");
      console.log(`🎮 User ${socket.id} is JOINER`);
    }
    
    // Send user count
    io.to(roomId).emit("user-count", room.users.length);
    
    // When room is full (2 users)
    if (room.users.length === 2) {
      console.log(`🎯 Room ${roomId} is FULL! Starting connection...`);
      
      // Tell initiator to create offer
      io.to(room.initiator).emit("start-connection", {
        as: "initiator"
      });
      
      // Tell joiner to wait for offer
      socket.emit("start-connection", {
        as: "joiner"
      });
    }
  });
  
  // Forward WebRTC signals between users
  socket.on("signal", ({ roomId, signal }) => {
    console.log(`📡 Signal: ${signal.type} from ${socket.id}`);
    socket.to(roomId).emit("signal", {
      from: socket.id,
      signal: signal
    });
  });
  
  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    
    // Remove user from rooms
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const index = room.users.indexOf(socket.id);
      
      if (index !== -1) {
        room.users.splice(index, 1);
        
        // Reset initiator if they left
        if (room.initiator === socket.id) {
          room.initiator = room.users[0] || null;
        }
        
        // Clean up empty room
        if (room.users.length === 0) {
          delete rooms[roomId];
          console.log(`🧹 Room ${roomId} deleted`);
        } else {
          // Notify remaining user
          io.to(roomId).emit("partner-left");
          io.to(roomId).emit("user-count", room.users.length);
        }
        break;
      }
    }
  });
});

// Start server
server.listen(3000, "0.0.0.0", () => {
  console.log("\n🚀 Server ready!");
  console.log("📱 Local: http://localhost:3000");
  console.log("🌍 Network: http://YOUR_IP:3000");
  console.log("🔗 New room: http://localhost:3000/new-room\n");
});