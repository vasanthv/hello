const fs = require("fs");
const path = require("path");

console.log("Node environment is:", process.env.NODE_ENV);

const replaceServiceWorkerVersion = () => {
	const serviceWorkerContents = fs.readFileSync(path.join(__dirname, "../public/sw.js")).toString();
	const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"))).version;

	const newServiceWorkerContents = serviceWorkerContents.replace("~VERSION~", VERSION);

	fs.writeFileSync(path.join(__dirname, "../public/sw.js"), newServiceWorkerContents);

	console.log("Service worker file updated to version", VERSION);
};

const addTurnServers = () => {
	const iceFileContents = fs.readFileSync(path.join(__dirname, "../public/ice-config.js")).toString();

	const udp = `{ urls: "${process.env.TURN_URL_UDP}", username: "${process.env.TURN_USERNAME}", credential: "${process.env.TURN_PASSWORD}" },\n`;
	const tcp = `{ urls: "${process.env.TURN_URL_TCP}", username: "${process.env.TURN_USERNAME}", credential: "${process.env.TURN_PASSWORD}" },\n`;

	let turnServers = "";

	if (process.env.TURN_URL_TCP) {
		turnServers += tcp;
	}
	if (process.env.TURN_URL_UDP) {
		turnServers += udp;
	}

	const newIceFileContents = iceFileContents.replace("// $TURN_SERVER", turnServers);

	fs.writeFileSync(path.join(__dirname, "../public/ice-config.js"), newIceFileContents);

	console.log("TURN servers added:", turnServers);
};

if (process.env.NODE_ENV === "production") {
	replaceServiceWorkerVersion();

	if (process.env.TURN_URL_TCP || process.env.TURN_URL_UDP) {
		addTurnServers();
	}
}
