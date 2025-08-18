/* globals App, io, ICE_SERVERS */
"use strict";

const SIGNALLING_SERVER = window.origin;
// ICE servers are now imported from ice-config.js
const VOLUME_THRESHOLD = 24;
const AUDIO_WINDOW_SIZE = 256;

let signalingSocket = null; /* our socket.io connection to our webserver */
window.signalingSocket = null; /* expose for global access */
let audioStreams = new Map(); // Holds audio stream related data for each stream

// Utility functions
const createPeerConnection = () => new RTCPeerConnection({ iceServers: ICE_SERVERS });

const setupPeerConnectionHandlers = (peerConnection, peer_id) => {
	peerConnection.onicecandidate = (event) => {
		if (event.candidate) {
			signalingSocket.emit("relayICECandidate", {
				peer_id,
				ice_candidate: {
					sdpMLineIndex: event.candidate.sdpMLineIndex,
					candidate: event.candidate.candidate,
				},
			});
		}
	};

	peerConnection.ontrack = (event) => {
		const stream = event.streams[0];
		App.peers[peer_id]["stream"] = stream;

		// Only handle audio stream if it contains audio tracks and not already handled
		if (stream.getAudioTracks().length > 0 && !audioStreams.has(peer_id)) {
			handleAudioStream(stream, peer_id);
		}
	};

	peerConnection.ondatachannel = (event) => {
		event.channel.onmessage = (msg) => {
			try {
				App.handleIncomingDataChannelMessage(JSON.parse(msg.data));
			} catch (err) {
				console.log(err);
			}
		};
	};
};

const addLocalTracksToPeer = (peerConnection) => {
	if (App.localMediaStream) {
		App.localMediaStream.getTracks().forEach((track) => {
			const sender = peerConnection.addTrack(track, App.localMediaStream);
			// Set codec preferences for video tracks if supported
			if (track.kind === "video" && window.RTCRtpSender && RTCRtpSender.getCapabilities) {
				const codecs = RTCRtpSender.getCapabilities("video").codecs;
				const preferredCodecs = codecs.filter((codec) => codec.mimeType.toLocaleLowerCase() === "video/h264");
				const transceiver = peerConnection.getTransceivers().find((t) => t.sender === sender);
				if (transceiver && transceiver.setCodecPreferences && preferredCodecs.length) {
					transceiver.setCodecPreferences(preferredCodecs);
				}
			}
		});
	}
};

// Prefer H.264 codec in SDP for better Safari compatibility
// WARNING: Avoid repeated calls to this function on the same SDP, as repeated reordering may cause interoperability issues with some clients.
function preferH264(sdp) {
	const sdpLines = sdp.split("\r\n");
	const mLineIndex = sdpLines.findIndex((line) => line.startsWith("m=video"));
	if (mLineIndex === -1) return sdp;

	// Find all H264 payload types
	const h264PayloadTypes = sdpLines
		.filter((line) => line.startsWith("a=rtpmap") && line.toLowerCase().includes("h264"))
		.map((line) => {
			const match = line.match(/^a=rtpmap:(\d+)\s+H264/i);
			return match ? match[1] : null;
		})
		.filter(Boolean);

	if (h264PayloadTypes.length === 0) return sdp;

	// Reorder m=video line to put H264 first
	const mLineParts = sdpLines[mLineIndex].split(" ");
	const newMLine = [
		...mLineParts.slice(0, 3),
		...h264PayloadTypes,
		...mLineParts.slice(3).filter((pt) => !h264PayloadTypes.includes(pt)),
	];
	sdpLines[mLineIndex] = newMLine.join(" ");

	return sdpLines.join("\r\n");
}

const setupOfferCreation = (peerConnection, peer_id) => {
	peerConnection.onnegotiationneeded = () => {
		peerConnection
			.createOffer()
			.then((localDescription) => {
				// Prefer H.264 in SDP for Safari compatibility (Safari only supports H.264 for video)
				localDescription.sdp = preferH264(localDescription.sdp);
				peerConnection
					.setLocalDescription(localDescription)
					.then(() => {
						signalingSocket.emit("relaySessionDescription", {
							peer_id: peer_id,
							session_description: localDescription,
						});
					})
					.catch((error) => console.log("Offer setLocalDescription failed!", error));
			})
			.catch((error) => console.log("Error sending offer: ", error));
	};
};

const handleSessionDescription = (config) => {
	const peer_id = config.peer_id;
	const peer = App.peers[peer_id]["rtc"];
	const remoteDescription = config.session_description;

	// Prefer H.264 in SDP for Safari compatibility (Safari only supports H.264 for video)
	if (remoteDescription && remoteDescription.sdp) {
		remoteDescription.sdp = preferH264(remoteDescription.sdp);
	}

	const desc = new RTCSessionDescription(remoteDescription);
	peer.setRemoteDescription(
		desc,
		() => {
			if (remoteDescription.type == "offer") {
				peer.createAnswer(
					(localDescription) => {
						// Prefer H.264 in SDP for Safari compatibility (Safari only supports H.264 for video)
						localDescription.sdp = preferH264(localDescription.sdp);
						peer.setLocalDescription(
							localDescription,
							() =>
								signalingSocket.emit("relaySessionDescription", {
									peer_id,
									session_description: localDescription,
								}),
							() => console.log("Answer setLocalDescription failed!")
						);
					},
					(error) => console.log("Error creating answer: ", error)
				);
			}
		},
		(error) => console.log("setRemoteDescription error: ", error)
	);
};

const handleIceCandidate = (config) => {
	const peer = App.peers[config.peer_id]["rtc"];
	const iceCandidate = config.ice_candidate;
	peer.addIceCandidate(new RTCIceCandidate(iceCandidate)).catch((error) => {
		console.log("Error addIceCandidate", error);
	});
};

const cleanupPeer = (peer_id) => {
	if (peer_id in App.peers) {
		App.peers[peer_id]["rtc"].close();
	}
	delete App.dataChannels[peer_id];
	delete App.peers[peer_id];
	removeAudioStream(peer_id);
};

const cleanupAllPeers = () => {
	Object.keys(App.peers).forEach((peer_id) => {
		App.peers[peer_id]["rtc"].close();
	});
	App.peers = {};
	App.cleanupScreenShare();
};

const joinChatChannel = (channel, userData) => signalingSocket.emit("join", { channel, userData });

window.initiateCall = () => {
	App.userAgent = navigator.userAgent;
	signalingSocket = io(SIGNALLING_SERVER);
	window.signalingSocket = signalingSocket; /* expose for global access */

	signalingSocket.on("connect", () => {
		App.peerId = signalingSocket.id;
		const userData = { peerName: App.name, userAgent: App.userAgent };

		if (App.localMediaStream) {
			joinChatChannel(App.channelId, userData);
		} else {
			setupLocalMedia(() => joinChatChannel(App.channelId, userData));
		}
	});

	signalingSocket.on("disconnect", cleanupAllPeers);

	signalingSocket.on("addPeer", (config) => {
		const peer_id = config.peer_id;
		if (peer_id in App.peers) return;

		const peerConnection = createPeerConnection();
		App.peers[peer_id] = { ...App.peers[peer_id], data: config.channel[peer_id].userData };
		App.peers[peer_id]["rtc"] = peerConnection;

		setupPeerConnectionHandlers(peerConnection, peer_id);
		addLocalTracksToPeer(peerConnection);
		App.dataChannels[peer_id] = peerConnection.createDataChannel("ot__data_channel");

		if (config.should_create_offer) {
			setupOfferCreation(peerConnection, peer_id);
		}
	});

	signalingSocket.on("sessionDescription", handleSessionDescription);
	signalingSocket.on("iceCandidate", handleIceCandidate);
	signalingSocket.on("removePeer", (config) => cleanupPeer(config.peer_id));
};

function setupLocalMedia(callback) {
	if (App.localMediaStream != null) {
		if (callback) callback();
		return;
	}

	// Build constraints based on settings
	const constraints = {
		audio: App.audioEnabled ? (App.selectedAudioDeviceId ? { deviceId: App.selectedAudioDeviceId } : true) : false,
		video: App.videoEnabled ? (App.selectedVideoDeviceId ? { deviceId: App.selectedVideoDeviceId } : true) : false,
	};

	navigator.mediaDevices
		.getUserMedia(constraints)
		.then((stream) => {
			App.localMediaStream = stream;

			if (callback) callback();
		})
		.catch((error) => {
			console.error(error);
			App.setToast("Unable to get microphone access.");
		});
}

function handleAudioStream(stream, peerId) {
	// Is peer talking analyser from https://www.linkedin.com/pulse/webrtc-active-speaker-detection-nilesh-gawande/
	const audioContext = new AudioContext();
	const mediaStreamSource = audioContext.createMediaStreamSource(stream);
	const analyserNode = audioContext.createAnalyser();
	analyserNode.fftSize = AUDIO_WINDOW_SIZE;
	mediaStreamSource.connect(analyserNode);
	const bufferLength = analyserNode.frequencyBinCount;
	const dataArray = new Uint8Array(bufferLength);

	function processAudio() {
		analyserNode.getByteFrequencyData(dataArray);
		const averageVolume = dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;
		App.setTalkingPeer(peerId, averageVolume > VOLUME_THRESHOLD);
		requestAnimationFrame(processAudio);
	}

	processAudio();
	audioStreams.set(peerId, { stream, analyserNode });
}

function removeAudioStream(peerId) {
	const streamData = audioStreams.get(peerId);
	if (streamData) {
		streamData.stream.getTracks().forEach((track) => track.stop());
		streamData.analyserNode.disconnect();
		audioStreams.delete(peerId);
	}
}
