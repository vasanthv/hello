const socketIO = require("socket.io");
const express = require("express");
const path = require("path");
const http = require("http");
const app = express();

const config = require("./config");
const signallingServer = require("./signalling-server");

// Get PORT from env variable else assign 3000 for development
const PORT = config.PORT || 3000;
const server = http.createServer(app);

app.set("view engine", "ejs");

app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));
app.use(express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "www"), { maxAge: 0 }));

const io = socketIO(server);
io.sockets.on("connection", signallingServer);

app.get("/", (req, res) => res.render("index", { page: "index", title: "A free video chat for the web." }));

app.get("/faq", (req, res) => res.render("faq", { page: "faq", title: "Frequently asked questions" }));
app.get(["/privacy", "/legal", "/terms"], (req, res) =>
	res.render("privacy", { page: "privacy", title: "Privacy policy" })
);
app.get("/404", (req, res) => res.render("404", { page: "404", title: "Page not found" }));

app.get("/:channel", (req, res) => {
	const channel = req.params.channel;
	const channelRegex = /^([a-zA-Z0-9-]){1,100}$/;
	if (!channelRegex.test(channel)) return res.render("invalid", { page: "invalid-channel", title: "Invalid channel" });

	res.render("channel", { page: "channel", title: channel });
});

app.use("/*", (req, res) => res.render("404", { page: "404", title: "Page not found" }));

server.listen(PORT, null, () => {
	console.log("Hello server started");
	console.log({ port: PORT, node_version: process.versions.node });
});
