/* globals Vue */

"use strict";

// eslint-disable-next-line no-unused-vars
const App = Vue.createApp({
	data() {
		const channelId = window.location.pathname.substr(1);
		const searchParams = new URLSearchParams(window.location.search);

		const name = searchParams.get("name");
		const chatEnabled = searchParams.get("chat") !== "false";

		return {
			channelId,
			peerId: "",
			userAgent: "",
			audioDevices: [],
			videoDevices: [],
			audioEnabled: true,
			videoEnabled: true,
			selectedAudioDeviceId: null,
			selectedVideoDeviceId: null,
			name: name ?? window.localStorage.name,
			callInitiated: false,
			localMediaStream: null,
			screenShareStream: null,
			isScreenSharing: false,
			peers: {},
			dataChannels: {},
			chatEnabled,
			chats: [],
			chatMessage: "",
			showChat: false,
			showExtraControls: false,
			showAudioDevices: false,
			showVideoDevices: false,
			toast: [{ type: "", message: "" }],
		};
	},
	computed: {
		peersArray() {
			return Object.keys(this.peers).map((peer) => ({
				stream: this.peers[peer].stream,
				name: this.peers[peer].data.peerName,
				isTalking: this.peers[peer].data.isTalking,
			}));
		},
		screenShareSupported() {
			return navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
		},
		videoLayoutClass() {
			const totalParticipants = this.peersArray.length + 1; // +1 for self

			if (totalParticipants === 1) return "layout-1";
			if (totalParticipants === 2) return "layout-2";
			if (totalParticipants === 3) return "layout-3";
			if (totalParticipants === 4) return "layout-4";
			if (totalParticipants === 5) return "layout-5";
			if (totalParticipants === 6) return "layout-6";
			return "layout-7-plus";
		},
	},
	watch: {
		selectedAudioDeviceId(newDeviceId, oldDeviceId) {
			if (!this.callInitiated && newDeviceId !== oldDeviceId) {
				this.getPreCallMedia();
			}
			if (newDeviceId !== oldDeviceId && this.callInitiated) {
				this.switchAudioDevice(newDeviceId);
			}
		},
		selectedVideoDeviceId(newDeviceId, oldDeviceId) {
			if (!this.callInitiated && newDeviceId !== oldDeviceId) {
				this.getPreCallMedia();
			}
			if (newDeviceId !== oldDeviceId && this.callInitiated) {
				this.switchVideoDevice(newDeviceId);
			}
		},
		callInitiated(newValue, oldValue) {
			if (oldValue && !newValue) {
				// Call ended, clean up screen sharing
				this.cleanupScreenShare();
			}
		},
	},
	methods: {
		toggleChat() {
			this.showChat = !this.showChat;
			this.showExtraControls = false;
		},
		toggleExtraControls() {
			this.showExtraControls = !this.showExtraControls;
			this.showChat = false;
		},
		resetPopups() {
			this.showChat = false;
			this.showExtraControls = false;
			this.showAudioDevices = false;
			this.showVideoDevices = false;
		},
		async toggleMedia(kind) {
			const enabledKey = kind + "Enabled";
			const selectedDeviceIdKey = "selected" + (kind.charAt(0).toUpperCase() + kind.slice(1)) + "DeviceId";
			const getTracks = kind === "audio" ? "getAudioTracks" : "getVideoTracks";
			const replaceTrackMethod = kind === "audio" ? "replaceAudioTrack" : "replaceVideoTrack";

			const existingTrack = this.localMediaStream[getTracks]()[0];

			if (existingTrack) {
				existingTrack.enabled = !existingTrack.enabled;
				this[enabledKey] = existingTrack.enabled;
			} else if (this[enabledKey]) {
				try {
					const constraints =
						kind === "audio"
							? { audio: { deviceId: { exact: this[selectedDeviceIdKey] } }, video: false }
							: { audio: false, video: { deviceId: { exact: this[selectedDeviceIdKey] } } };
					const newStream = await navigator.mediaDevices.getUserMedia(constraints);
					const newTrack = newStream[getTracks]()[0];
					this[replaceTrackMethod](newTrack);
				} catch {
					this.setToast(`Failed to enable ${kind}`);
					this[enabledKey] = false;
				}
			} else {
				try {
					const constraints =
						kind === "audio"
							? { audio: { deviceId: { exact: this[selectedDeviceIdKey] } }, video: false }
							: { audio: false, video: { deviceId: { exact: this[selectedDeviceIdKey] } } };
					const newStream = await navigator.mediaDevices.getUserMedia(constraints);
					const newTrack = newStream[getTracks]()[0];
					this[replaceTrackMethod](newTrack);
					this[enabledKey] = true;
				} catch {
					this.setToast(`Failed to enable ${kind}`);
				}
			}
		},
		async switchMediaDevice(newDeviceId, kind) {
			try {
				const constraints =
					kind === "audio"
						? { audio: { deviceId: { exact: newDeviceId } }, video: false }
						: { audio: false, video: { deviceId: { exact: newDeviceId } } };
				const newStream = await navigator.mediaDevices.getUserMedia(constraints);
				const getTracks = kind === "audio" ? "getAudioTracks" : "getVideoTracks";
				const replaceTrackMethod = kind === "audio" ? "replaceAudioTrack" : "replaceVideoTrack";
				if (this.localMediaStream) {
					const oldTrack = this.localMediaStream[getTracks]()[0];
					if (oldTrack) oldTrack.stop();
				}
				const newTrack = newStream[getTracks]()[0];
				this[replaceTrackMethod](newTrack);
				this.setToast(`${kind.charAt(0).toUpperCase() + kind.slice(1)} device changed successfully`, "success");
			} catch {
				this.setToast(`Failed to switch ${kind} device`);
			}
		},
		replaceMediaTrack(newTrack, kind) {
			const getSendersKind = kind;
			Object.keys(this.peers).forEach((peerId) => {
				const peerConnection = this.peers[peerId].rtc;
				const senders = peerConnection.getSenders();
				const sender = senders.find((s) => s.track && s.track.kind === getSendersKind);
				if (sender) {
					sender.replaceTrack(newTrack);
				} else {
					peerConnection.addTrack(newTrack, this.localMediaStream);
					this.triggerRenegotiation(peerId);
				}
			});
			if (this.localMediaStream) {
				const getTracks = kind === "audio" ? "getAudioTracks" : "getVideoTracks";
				const oldTrack = this.localMediaStream[getTracks]()[0];
				if (oldTrack) this.localMediaStream.removeTrack(oldTrack);
				this.localMediaStream.addTrack(newTrack);
			}
		},
		async triggerRenegotiation(peerId) {
			try {
				const peerConnection = this.peers[peerId].rtc;

				const offer = await peerConnection.createOffer();
				await peerConnection.setLocalDescription(offer);

				// Send the offer through the signaling server
				if (window.signalingSocket) {
					window.signalingSocket.emit("relaySessionDescription", {
						peer_id: peerId,
						session_description: offer,
					});
				}
			} catch (error) {
				console.error(`Error during renegotiation for peer ${peerId}:`, error);
			}
		},
		replaceVideoTrack(newVideoTrack) {
			// Replace video track in all peer connections
			Object.keys(this.peers).forEach((peerId) => {
				const peerConnection = this.peers[peerId].rtc;
				const senders = peerConnection.getSenders();

				const videoSender = senders.find((sender) => sender.track && sender.track.kind === "video");

				if (videoSender) {
					// Replace existing video track
					videoSender.replaceTrack(newVideoTrack);
				} else {
					// No existing video sender, add new video track
					peerConnection.addTrack(newVideoTrack, this.localMediaStream);
					// Trigger renegotiation for this peer
					this.triggerRenegotiation(peerId);
				}
			});

			// Update local video element
			if (this.localMediaStream) {
				const oldVideoTrack = this.localMediaStream.getVideoTracks()[0];
				if (oldVideoTrack) {
					this.localMediaStream.removeTrack(oldVideoTrack);
				}
				this.localMediaStream.addTrack(newVideoTrack);
			}
		},
		replaceAudioTrack(newAudioTrack) {
			// Replace audio track in all peer connections
			Object.keys(this.peers).forEach((peerId) => {
				const peerConnection = this.peers[peerId].rtc;
				const senders = peerConnection.getSenders();
				const audioSender = senders.find((sender) => sender.track && sender.track.kind === "audio");

				if (audioSender) {
					// Replace existing audio track
					audioSender.replaceTrack(newAudioTrack);
				} else {
					// No existing audio sender, add new audio track
					peerConnection.addTrack(newAudioTrack, this.localMediaStream);
					// Trigger renegotiation for this peer
					this.triggerRenegotiation(peerId);
				}
			});

			// Update local media stream
			if (this.localMediaStream) {
				const oldAudioTrack = this.localMediaStream.getAudioTracks()[0];
				if (oldAudioTrack) {
					this.localMediaStream.removeTrack(oldAudioTrack);
				}
				this.localMediaStream.addTrack(newAudioTrack);
			}
		},
		async startScreenShare() {
			try {
				// Get screen share stream
				const screenStream = await navigator.mediaDevices.getDisplayMedia({
					video: {
						cursor: "always",
						displaySurface: "monitor",
					},
					audio: false,
				});

				// Check if stream has video tracks
				if (!screenStream.getVideoTracks().length) {
					screenStream.getTracks().forEach((track) => track.stop());
					this.setToast("No video track found in screen share");
					return;
				}

				this.screenShareStream = screenStream;
				this.isScreenSharing = true;

				// Handle screen share stop
				screenStream.getVideoTracks()[0].onended = () => {
					this.stopScreenShare();
				};

				// Replace video track with screen share track
				const screenVideoTrack = screenStream.getVideoTracks()[0];
				this.replaceVideoTrack(screenVideoTrack);

				this.setToast("Screen sharing started", "success");
			} catch (error) {
				console.error("Error starting screen share:", error);
				if (error.name === "NotAllowedError") {
					this.setToast("Screen sharing permission denied");
				} else if (error.name === "NotSupportedError") {
					this.setToast("Screen sharing not supported in this browser");
				} else if (error.name === "AbortError") {
					// User cancelled the screen share dialog
				} else {
					this.setToast("Failed to start screen sharing");
				}
			}
		},

		async stopScreenShare() {
			try {
				if (this.screenShareStream) {
					// Stop all tracks in screen share stream
					this.screenShareStream.getTracks().forEach((track) => track.stop());
					this.screenShareStream = null;
				}

				this.isScreenSharing = false;

				// Get new video stream with the selected video device
				const newVideoStream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: { deviceId: { exact: this.selectedVideoDeviceId } },
				});

				// Replace video track with camera track
				const newVideoTrack = newVideoStream.getVideoTracks()[0];
				this.replaceVideoTrack(newVideoTrack);

				this.setToast("Screen sharing stopped", "success");
			} catch (error) {
				console.error("Error stopping screen share:", error);
				this.setToast("Failed to stop screen sharing");
			}
		},

		toggleScreenShare() {
			if (this.isScreenSharing) {
				this.stopScreenShare();
			} else {
				this.startScreenShare();
			}
			this.showExtraControls = false;
		},

		cleanupScreenShare() {
			if (this.screenShareStream) {
				this.screenShareStream.getTracks().forEach((track) => track.stop());
				this.screenShareStream = null;
			}
			this.isScreenSharing = false;
		},

		initiateCall() {
			if (!this.channelId) return alert("Invalid channel id");
			if (!this.name) return alert("Please enter your name");
			if (!this.videoEnabled && !this.audioEnabled) return alert("Please enable either audio or video");
			this.callInitiated = true;
			this.showExtraControls - false;
			window.initiateCall();
		},
		setToast(message, type = "error") {
			this.toast = { type, message, time: new Date().getTime() };
			setTimeout(() => {
				if (new Date().getTime() - this.toast.time >= 3000) {
					this.toast.message = "";
				}
			}, 3500);
		},
		copyURL() {
			navigator.clipboard.writeText(`${window.location.origin}/${this.channelId}`).then(
				() => this.setToast("Channel URL copied 👍", "success"),
				() => this.setToast("Unable to copy channel URL")
			);
		},
		toggleAudio() {
			return this.toggleMedia("audio");
		},
		toggleVideo() {
			return this.toggleMedia("video");
		},
		switchAudioDevice(newDeviceId) {
			return this.switchMediaDevice(newDeviceId, "audio");
		},
		switchVideoDevice(newDeviceId) {
			return this.switchMediaDevice(newDeviceId, "video");
		},
		togglePreCallAudio() {
			this.audioEnabled = !this.audioEnabled;
			this.getPreCallMedia();
		},
		togglePreCallVideo() {
			this.videoEnabled = !this.videoEnabled;
			this.getPreCallMedia();
		},
		endCall() {
			// Disconnect from signaling server
			if (window.signalingSocket) {
				window.signalingSocket.disconnect();
			}

			// Clean up all peer connections
			Object.keys(this.peers).forEach((peerId) => {
				if (this.peers[peerId].rtc) {
					this.peers[peerId].rtc.close();
				}
			});

			// Clean up data channels
			Object.keys(this.dataChannels).forEach((peerId) => {
				if (this.dataChannels[peerId]) {
					this.dataChannels[peerId].close();
				}
			});

			// Reset call state
			this.peers = {};
			this.dataChannels = {};
			this.callInitiated = false;
			this.chats = [];
			this.showChat = false;

			// Clean up screen sharing
			this.cleanupScreenShare();

			// Show toast
			this.setToast("Call ended", "success");

			// Re-initialize pre-call preview
			this.getPreCallMedia();
		},
		stopEvent(e) {
			e.preventDefault();
			e.stopPropagation();
		},
		updateName() {
			window.localStorage.name = this.name;
		},
		updateNameAndPublish() {
			window.localStorage.name = this.name;
			this.updateUserData("peerName", this.name);
		},
		updateUserData(key, value) {
			this.sendDataMessage(key, value);
		},
		formatDate(dateString) {
			const date = new Date(dateString);
			const hours = date.getHours() > 12 ? date.getHours() - 12 : date.getHours();
			return (
				(hours < 10 ? "0" + hours : hours) +
				":" +
				(date.getMinutes() < 10 ? "0" + date.getMinutes() : date.getMinutes()) +
				" " +
				(date.getHours() >= 12 ? "PM" : "AM")
			);
		},
		sanitizeString(str) {
			const tagsToReplace = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
			const replaceTag = (tag) => tagsToReplace[tag] || tag;
			const safe_tags_replace = (str) => str.replace(/[&<>]/g, replaceTag);
			return safe_tags_replace(str);
		},
		linkify(str) {
			return this.sanitizeString(str).replace(/(?:(?:https?|ftp):\/\/)?[\w/\-?=%.]+\.[\w/\-?=%]+/gi, (match) => {
				let displayURL = match.trim().replace("https://", "").replace("https://", "");
				displayURL = displayURL.length > 25 ? displayURL.substr(0, 25) + "&hellip;" : displayURL;
				const url = !/^https?:\/\//i.test(match) ? "http://" + match : match;
				return `<a href="${url}" target="_blank" class="link" rel="noopener">${displayURL}</a>`;
			});
		},
		sendChat(e) {
			e.stopPropagation();
			e.preventDefault();

			if (!this.chatMessage.length) return;

			if (Object.keys(this.peers).length > 0) {
				this.sendDataMessage("chat", this.chatMessage);
				this.chatMessage = "";
			} else {
				alert("No peers in the room");
			}
		},
		sendDataMessage(key, value) {
			const date = new Date().toISOString();
			const dataMessage = { type: key, name: this.name, peerId: this.peerId, message: value, date };

			switch (key) {
				case "chat":
					this.chats.push(dataMessage);
					break;
				default:
					break;
			}

			Object.keys(this.dataChannels).map((peer_id) => this.dataChannels[peer_id].send(JSON.stringify(dataMessage)));
		},
		setTalkingPeer(peerId, isTalking) {
			if (this.peers[peerId] && this.peers[peerId].data.isTalking !== isTalking) {
				this.peers[peerId].data.isTalking = isTalking;
			}
		},
		handleIncomingDataChannelMessage(dataMessage) {
			if (!this.peers[dataMessage.peerId]) return;
			switch (dataMessage.type) {
				case "peerName":
					this.peers[dataMessage.peerId].data.peerName = dataMessage.message;
					break;
				case "chat":
					this.showChat = true;
					this.chats.push(dataMessage);
					break;
				default:
					break;
			}
		},
		async enumerateDevices() {
			// Request media permissions and enumerate devices
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();

				this.audioDevices = devices.filter((device) => device.kind === "audioinput");
				this.videoDevices = devices.filter((device) => device.kind === "videoinput");

				// Set default device ids
				const defaultAudioDeviceId = this.audioDevices.find((device) => device.deviceId == "default")?.deviceId;
				const defaultVideoDeviceId = this.videoDevices.find((device) => device.deviceId == "default")?.deviceId;

				this.selectedAudioDeviceId = defaultAudioDeviceId ?? this.audioDevices[0]?.deviceId;
				this.selectedVideoDeviceId = defaultVideoDeviceId ?? this.videoDevices[0]?.deviceId;
			} catch (error) {
				console.error("Failed to initialize media devices:", error);
			}
		},
		async getPreCallMedia() {
			try {
				if (this.localMediaStream) {
					this.localMediaStream.getTracks().forEach((track) => track.stop());
				}
				const constraints = {
					audio: this.audioEnabled
						? this.selectedAudioDeviceId
							? { deviceId: this.selectedAudioDeviceId }
							: true
						: false,
					video: this.videoEnabled
						? this.selectedVideoDeviceId
							? { deviceId: this.selectedVideoDeviceId }
							: true
						: false,
				};
				const stream = await navigator.mediaDevices.getUserMedia(constraints);
				this.localMediaStream = stream;
				const videoElem = document.getElementById("preCallVideo");
				if (videoElem) {
					videoElem.srcObject = stream;
				}

				// Enumerate devices once during pre-call flow if not already done
				if (this.audioDevices.length === 0 && this.videoDevices.length === 0) {
					await this.enumerateDevices();
				}
			} catch {
				this.setToast("Unable to access camera/mic");
			}
		},
		requestFullscreen(videoElem) {
			if (!videoElem) return;
			const el = Array.isArray(videoElem) ? videoElem[0] : videoElem;
			if (el.requestFullscreen) {
				el.requestFullscreen();
			} else if (el.webkitRequestFullscreen) {
				el.webkitRequestFullscreen();
			} else if (el.mozRequestFullScreen) {
				el.mozRequestFullScreen();
			} else if (el.msRequestFullscreen) {
				el.msRequestFullscreen();
			}
		},
	},
	mounted() {
		if (!this.callInitiated) {
			this.getPreCallMedia();
		}
	},
}).mount("#app");

// Register service worker for PWA functionality
if ("serviceWorker" in navigator) {
	navigator.serviceWorker.register("/sw.js");
}
