"use strict"; // https://www.w3schools.com/js/js_strict.asp

const ngrok = require("ngrok");
const express = require("express");
const path = require("path");
const http = require("http");
const app = express();
const server = http.createServer(app);
const io = require("socket.io")(server);
const util = require("util");

// util options
const options = {
	depth: null,
	colors: true,
};

// Server all the static files from www folder
app.use(express.static(path.join(__dirname, "www")));
app.use(express.static(path.join(__dirname, "icons")));
app.use(express.static(path.join(__dirname, "assets")));
app.use(express.static(path.join(__dirname, "node_modules/vue/dist/")));

// Get PORT from env variable else assign 3000 for development
const PORT = process.env.PORT || 3000;

// Get NGROK_AUTH_TOKEN from env variable: https://ngrok.com
const NGROK_AUTH_TOKEN = process.env.NGROK_AUTH_TOKEN || "";

server.listen(PORT, null, () => {
	// On default not set
	if (NGROK_AUTH_TOKEN) {
		ngrokStart();
	} else {
		console.log("Server", {
			listening_on: "http://localhost:" + PORT,
			node_version: process.versions.node,
		});
	}
});

/**
 * Expose Server to external with https tunnel using ngrok:
 * https://www.npmjs.com/package/ngrok
 */
async function ngrokStart() {
	try {
		await ngrok.authtoken(NGROK_AUTH_TOKEN);
		await ngrok.connect(PORT);
		let api = ngrok.getApi();
		let data = await api.listTunnels();
		let pu0 = data.tunnels[0].public_url;
		let pu1 = data.tunnels[1].public_url;
		let tunnelHttps = pu0.startsWith("https") ? pu0 : pu1;
		// Server settings
		console.log("Server", {
			listen_on: "http://localhost:" + PORT,
			tunnel_https: tunnelHttps,
			node_version: process.versions.node,
		});
	} catch (err) {
		console.warn("Error ngrokStart", err.body);
		process.exit(1);
	}
}

app.get("/legal", (req, res) => res.sendFile(path.join(__dirname, "www/legal.html")));

// All URL patterns should served with the same file.
app.get(["/", "/:room"], (req, res) => res.sendFile(path.join(__dirname, "www/index.html")));

const channels = {};
const sockets = {};
const peers = {};

io.sockets.on("connection", (socket) => {
	const socketHostName = socket.handshake.headers.host.split(":")[0];

	socket.channels = {};
	sockets[socket.id] = socket;

	console.log("[" + socket.id + "] connection accepted");
	socket.on("disconnect", () => {
		for (const channel in socket.channels) {
			part(channel);
		}
		console.log("[" + socket.id + "] disconnected");
		delete sockets[socket.id];
	});

	socket.on("join", (config) => {
		console.log("[" + socket.id + "] join ", config);
		const channel = socketHostName + config.channel;

		// Already Joined
		if (channel in socket.channels) return;

		if (!(channel in channels)) {
			channels[channel] = {};
		}

		if (!(channel in peers)) {
			peers[channel] = {};
		}

		peers[channel][socket.id] = {
			userData: config.userData,
		};

		console.log("[" + socket.id + "] join - connected peers grouped by channel", util.inspect(peers, options));

		for (const id in channels[channel]) {
			channels[channel][id].emit("addPeer", {
				peer_id: socket.id,
				should_create_offer: false,
				channel: peers[channel],
			});
			socket.emit("addPeer", { peer_id: id, should_create_offer: true, channel: peers[channel] });
		}

		channels[channel][socket.id] = socket;
		socket.channels[channel] = channel;
	});

	socket.on("updateUserData", async (config) => {
		const channel = socketHostName + config.channel;
		const key = config.key;
		const value = config.value;
		for (let id in peers[channel]) {
			if (id == socket.id) {
				peers[channel][id]["userData"][key] = value;
			}
		}
		console.log("[" + socket.id + "] updateUserData", util.inspect(peers[channel][socket.id], options));
	});

	const part = (channel) => {
		// Socket not in channel
		if (!(channel in socket.channels)) return;

		delete socket.channels[channel];
		delete channels[channel][socket.id];

		delete peers[channel][socket.id];
		if (Object.keys(peers[channel]).length == 0) {
			// last peer disconnected from the channel
			delete peers[channel];
		}
		console.log("[" + socket.id + "] part - connected peers grouped by channel", util.inspect(peers, options));

		for (const id in channels[channel]) {
			channels[channel][id].emit("removePeer", { peer_id: socket.id });
			socket.emit("removePeer", { peer_id: id });
		}
	};

	socket.on("relayICECandidate", (config) => {
		let peer_id = config.peer_id;
		let ice_candidate = config.ice_candidate;
		console.log("[" + socket.id + "] relay ICE-candidate to [" + peer_id + "] ", ice_candidate);

		if (peer_id in sockets) {
			sockets[peer_id].emit("iceCandidate", { peer_id: socket.id, ice_candidate: ice_candidate });
		}
	});

	socket.on("relaySessionDescription", (config) => {
		let peer_id = config.peer_id;
		let session_description = config.session_description;
		console.log("[" + socket.id + "] relay SessionDescription to [" + peer_id + "] ", session_description);

		if (peer_id in sockets) {
			sockets[peer_id].emit("sessionDescription", {
				peer_id: socket.id,
				session_description: session_description,
			});
		}
	});
});
