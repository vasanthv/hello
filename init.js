// Import required modules
const socketIO = require("socket.io"); // For real-time WebSocket communication
const express = require("express"); // Web framework for Node.js
const path = require("path"); // Utility for handling file and directory paths
const http = require("http"); // Node.js HTTP server
const app = express(); // Create an Express application

// Import configuration and signalling server logic
const config = require("./server/config");
const signallingServer = require("./server/signalling-server");

// Get PORT from env variable else assign 3000 for development
const PORT = config.PORT || 824;
const server = http.createServer(app); // Create HTTP server with Express app

// Set EJS as the view engine for rendering templates
app.set("view engine", "ejs");

// Serve static files from Vue, assets, and www directories
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));
app.use(express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "www"), { maxAge: 0 })); // No cache for www

// Initialize Socket.IO and attach signalling server logic
const io = socketIO(server);
io.sockets.on("connection", signallingServer);

// Route: Home page
app.get("/", (req, res) => res.render("index", { page: "index", title: "A free video chat for the web." }));

// Route: Static views (faq, privacy, etc.)
app.get(Object.keys(config.STATIC_VIEWS), (req, res) => {
	const view = req.path.substring(1); // Remove leading slash to get view name
	res.render(view, { page: view, title: config.STATIC_VIEWS[req.path] });
});

// Route: Channel page (dynamic)
app.get("/:channel", (req, res) => {
	const channel = req.params.channel;
	const channelRegex = /^([a-zA-Z0-9-]){1,100}$/; // Only allow alphanumeric and hyphens, 1-100 chars
	if (!channelRegex.test(channel)) return res.render("invalid", { page: "invalid-channel", title: "Invalid channel" });

	res.render("channel", { page: "channel", title: channel });
});

// Route: Catch-all for 404 errors
app.use(["/*", "/404"], (req, res) => res.render("404", { page: "404", title: "Page not found" }));

// Start the server and log status
server.listen(PORT, null, () => {
	console.log("Ahey server started");
	console.log({ port: PORT, node_version: process.versions.node });
});
