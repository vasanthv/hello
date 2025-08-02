// ICE Server Configuration for WebRTC
// Contains STUN and TURN servers for NAT traversal and relay

window.ICE_SERVERS = [
	// STUN servers
	{ urls: "stun:stun.l.google.com:19302" },
	{ urls: "stun:stun1.l.google.com:19302" },
	{ urls: "stun:stun2.l.google.com:19302" },
	{ urls: "stun:stun3.l.google.com:19302" },
	{ urls: "stun:stun4.l.google.com:19302" },
	{ urls: "stun:stun.relay.metered.ca:80" },
	{ urls: "stun:turn.ahey.net:3478" },

	// TURN servers are needed as a fallback relay server when direct peer-to-peer communication isn’t possible.
	// It relays data between peers, ensuring connectivity even in restrictive network conditions.
	// $TURN_SERVER

	// Fallback TURN servers
	{ urls: "turn:global.relay.metered.ca:80", username: "3ba485bee1f0b3b6cb46958b", credential: "OCJtcDPtoOQhNvur" },
	{
		urls: "turn:global.relay.metered.ca:80?transport=tcp",
		username: "3ba485bee1f0b3b6cb46958b",
		credential: "OCJtcDPtoOQhNvur",
	},
	{ urls: "turn:global.relay.metered.ca:443", username: "3ba485bee1f0b3b6cb46958b", credential: "OCJtcDPtoOQhNvur" },
	{
		urls: "turns:global.relay.metered.ca:443?transport=tcp",
		username: "3ba485bee1f0b3b6cb46958b",
		credential: "OCJtcDPtoOQhNvur",
	},
	{
		urls: "turn:relay1.expressturn.com:3480",
		username: "000000002067721570",
		credential: "e2TIZZpxF5OGyXHwyhfcykdBySU=",
	},
];

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
	module.exports = { ICE_SERVERS: window.ICE_SERVERS };
}
