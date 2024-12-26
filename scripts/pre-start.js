const fs = require("fs");
const path = require("path");

console.log("Node environment is:", process.env.NODE_ENV);
if (process.env.NODE_ENV === "production") {
	const serviceWorkerContents = fs.readFileSync(path.join(__dirname, "../www/sw.js")).toString();
	const VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "../package.json"))).version;

	const newServiceWorkerContents = serviceWorkerContents.replace("~VERSION~", VERSION);

	fs.writeFileSync(path.join(__dirname, "../www/sw.js"), newServiceWorkerContents);

	console.log("Service worker file updated to version", VERSION);
}
