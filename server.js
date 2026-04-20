const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MongoDB connect
mongoose.connect("mongodb://127.0.0.1:27017/chatDB")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log(err));

// Middleware
app.use(express.static("public"));
app.use(express.json());

// ================= USER SCHEMA =================
const userSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String
});
const User = mongoose.model("User", userSchema);

// ================= MESSAGE SCHEMA =================
const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    message: String,
    time: String
});
const Message = mongoose.model("Message", messageSchema);

// ================= REGISTER =================
app.post("/register", async (req, res) => {
    const { username, password } = req.body;

    const existing = await User.findOne({ username });
    if (existing) return res.send("User already exists");

    const hashed = await bcrypt.hash(password, 10);

    const newUser = new User({ username, password: hashed });
    await newUser.save();

    res.send("Registered successfully");
});

// ================= LOGIN =================
app.post("/login", async (req, res) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user) return res.send("User not found");

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.send("Wrong password");

    res.send("Login success");
});

// ================= SOCKET =================
let users = {}; // socket.id : username

io.on("connection", (socket) => {

    console.log("User Connected");

    socket.on("typing", () => {
    socket.broadcast.emit("show typing", socket.username);
});

    // JOIN
    socket.on("user joined", (username) => {
        socket.username = username;
        users[socket.id] = username;

        io.emit("update users", users);
    });

    // PRIVATE MESSAGE
   socket.on("private message", async ({ to, message }) => {

    console.log("Message received:", message); // 👈 ADD THIS

    if (!users[to]) return;

    const time = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });

    const data = {
        sender: socket.username,
        receiver: users[to],
        message,
        time
    };

    console.log("Saving to DB:", data); // 👈 ADD THIS

    await new Message(data).save();

    console.log("Saved successfully"); // 👈 ADD THIS

    io.to(to).emit("private message", data);
    socket.emit("private message", data);
});

    // LOAD PRIVATE CHAT
    socket.on("load private chat", async (otherUser) => {

        const chats = await Message.find({
            $or: [
                { sender: socket.username, receiver: otherUser },
                { sender: otherUser, receiver: socket.username }
            ]
        });

        socket.emit("private history", chats);
    });

    // CLEAR CHAT
    socket.on("clear chat", async (otherUser) => {

        await Message.deleteMany({
            $or: [
                { sender: socket.username, receiver: otherUser },
                { sender: otherUser, receiver: socket.username }
            ]
        });

        socket.emit("chat cleared");
    });

    // DISCONNECT
    socket.on("disconnect", () => {
        delete users[socket.id];
        io.emit("update users", users);
    });

});

// ================= SERVER START =================
server.listen(3000, "0.0.0.0", () => {
    console.log("Server running on LAN");
});