/* globals Vue */

"use strict";

const App = Vue.createApp({
	data() {
		const channelId = window.location.pathname.substr(1);
		const channelLink = `${window.location.origin}/${channelId}`;
		const searchParams = new URLSearchParams(window.location.search);

		const name = searchParams.get("name");
		const chatEnabled = searchParams.get("chat") !== "false";
		const showHeader = searchParams.get("header") !== "false";

		return {
			channelId,
			channelLink,
			peerId: "",
			userAgent: "",
			audioDevices: [],
			videoDevices: [],
			audioEnabled: true,
			videoEnabled: true,
			showSettings: false,
			selectedAudioDeviceId: null,
			selectedVideoDeviceId: null,
			name: name ?? window.localStorage.name,
			callInitiated: false,
			localMediaStream: null,
			screenShareStream: null,
			isScreenSharing: false,
			peers: {},
			dataChannels: {},
			showHeader,
			chatEnabled,
			chats: [],
			chatMessage: "",
			showChat: false,
			toast: [{ type: "", message: "" }],
		};
	},
	computed: {
		peersArray() {
			return Object.keys(this.peers).map((peer) => {
				let isMuted = false;
				if (this.peers[peer].stream) {
					const audioTracks = this.peers[peer].stream.getAudioTracks();
					if (audioTracks.length > 0) {
						isMuted = audioTracks[0].muted;
					}
				}

				return {
					stream: this.peers[peer].stream,
					name: this.peers[peer].data.peerName,
					isTalking: this.peers[peer].data.isTalking,
					isMuted,
				};
			});
		},
		screenShareSupported() {
			return navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
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
		async switchAudioDevice(newDeviceId) {
			try {
				// Get new audio stream with the selected device
				const newStream = await navigator.mediaDevices.getUserMedia({
					audio: { deviceId: { exact: newDeviceId } },
					video: false,
				});

				// Stop the old audio track
				if (this.localMediaStream) {
					const oldAudioTrack = this.localMediaStream.getAudioTracks()[0];
					if (oldAudioTrack) {
						oldAudioTrack.stop();
					}
				}

				// Replace audio track using the consolidated function
				const newAudioTrack = newStream.getAudioTracks()[0];
				this.replaceAudioTrack(newAudioTrack);

				this.setToast("Audio device changed successfully", "success");
			} catch (error) {
				console.error("Error switching audio device:", error);
				this.setToast("Failed to switch audio device");
			}
		},

		async switchVideoDevice(newDeviceId) {
			try {
				// Get new video stream with the selected device
				const newStream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: { deviceId: { exact: newDeviceId } },
				});

				// Stop the old video track
				if (this.localMediaStream) {
					const oldVideoTrack = this.localMediaStream.getVideoTracks()[0];
					if (oldVideoTrack) {
						oldVideoTrack.stop();
					}
				}

				// Replace video track using the consolidated function
				const newVideoTrack = newStream.getVideoTracks()[0];
				this.replaceVideoTrack(newVideoTrack);

				this.setToast("Video device changed successfully", "success");
			} catch (error) {
				console.error("Error switching video device:", error);
				this.setToast("Failed to switch video device");
			}
		},

		// Helper function to trigger renegotiation for a specific peer
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

		// Consolidated function to replace video tracks across all peer connections and local media stream
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

		// Consolidated function to replace audio tracks across all peer connections and local media stream
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

				// Don't stop the new video stream - it's now being used by the peer connections and local media stream
				// The tracks will be stopped when the call ends or when switching devices

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
			navigator.clipboard.writeText(this.channelLink).then(
				() => this.setToast("Channel URL copied 👍", "success"),
				() => this.setToast("Unable to copy channel URL")
			);
		},
		async toggleAudio(e) {
			e.stopPropagation();

			// Check if we have an audio track in the local media stream
			const existingAudioTrack = this.localMediaStream.getAudioTracks()[0];

			if (existingAudioTrack) {
				// Audio track exists, just toggle its enabled state
				existingAudioTrack.enabled = !existingAudioTrack.enabled;
				this.audioEnabled = existingAudioTrack.enabled;
			} else if (this.audioEnabled) {
				// No audio track but audioEnabled is true - this shouldn't happen normally
				// but we'll handle it by creating a new audio track
				try {
					const newAudioStream = await navigator.mediaDevices.getUserMedia({
						audio: { deviceId: { exact: this.selectedAudioDeviceId } },
						video: false,
					});

					const newAudioTrack = newAudioStream.getAudioTracks()[0];
					this.replaceAudioTrack(newAudioTrack);

					// Stop the temporary stream since we've moved the track
					// newAudioStream.getTracks().forEach((track) => {
					// 	if (track !== newAudioTrack) track.stop();
					// });
				} catch (error) {
					console.error("Error creating audio track:", error);
					this.setToast("Failed to enable audio");
					this.audioEnabled = false;
				}
			} else {
				// No audio track and audioEnabled is false - create a new audio track
				try {
					const newAudioStream = await navigator.mediaDevices.getUserMedia({
						audio: { deviceId: { exact: this.selectedAudioDeviceId } },
						video: false,
					});

					const newAudioTrack = newAudioStream.getAudioTracks()[0];
					this.replaceAudioTrack(newAudioTrack);
					this.audioEnabled = true;

					// Stop the temporary stream since we've moved the track
					// newAudioStream.getTracks().forEach((track) => {
					// 	if (track !== newAudioTrack) track.stop();
					// });
				} catch (error) {
					console.error("Error creating audio track:", error);
					this.setToast("Failed to enable audio");
				}
			}
		},
		async toggleVideo(e) {
			e.stopPropagation();

			// Check if we have a video track in the local media stream
			const existingVideoTrack = this.localMediaStream.getVideoTracks()[0];

			if (existingVideoTrack) {
				// Video track exists, just toggle its enabled state
				existingVideoTrack.enabled = !existingVideoTrack.enabled;
				this.videoEnabled = existingVideoTrack.enabled;
			} else if (this.videoEnabled) {
				// No video track but videoEnabled is true - this shouldn't happen normally
				// but we'll handle it by creating a new video track
				try {
					const newVideoStream = await navigator.mediaDevices.getUserMedia({
						audio: false,
						video: { deviceId: { exact: this.selectedVideoDeviceId } },
					});

					const newVideoTrack = newVideoStream.getVideoTracks()[0];
					this.replaceVideoTrack(newVideoTrack);

					// Stop the temporary stream since we've moved the track
					// newVideoStream.getTracks().forEach((track) => {
					// 	if (track !== newVideoTrack) track.stop();
					// });
				} catch (error) {
					console.error("Error creating video track:", error);
					this.setToast("Failed to enable video");
					this.videoEnabled = false;
				}
			} else {
				// No video track and videoEnabled is false - create a new video track
				try {
					const newVideoStream = await navigator.mediaDevices.getUserMedia({
						audio: false,
						video: { deviceId: { exact: this.selectedVideoDeviceId } },
					});

					const newVideoTrack = newVideoStream.getVideoTracks()[0];
					this.replaceVideoTrack(newVideoTrack);
					this.videoEnabled = true;

					// Stop the temporary stream since we've moved the track
					// newVideoStream.getTracks().forEach((track) => {
					// 	if (track !== newVideoTrack) track.stop();
					// });
				} catch (error) {
					console.error("Error creating video track:", error);
					this.setToast("Failed to enable video");
				}
			}
		},
		togglePreCallAudio(e) {
			e.stopPropagation();
			this.audioEnabled = !this.audioEnabled;
			this.getPreCallMedia();
		},
		togglePreCallVideo(e) {
			e.stopPropagation();
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
		async getPreCallMedia() {
			try {
				if (this.localMediaStream) {
					this.localMediaStream.getTracks().forEach((track) => track.stop());
				}
				const constraints = {
					audio: this.audioEnabled ? { deviceId: this.selectedAudioDeviceId } : false,
					video: this.videoEnabled ? { deviceId: this.selectedVideoDeviceId } : false,
				};
				const stream = await navigator.mediaDevices.getUserMedia(constraints);
				this.localMediaStream = stream;
				const videoElem = document.getElementById("preCallVideo");
				if (videoElem) {
					videoElem.srcObject = stream;
				}
			} catch {
				this.setToast("Unable to access camera/mic");
			}
		},
	},
	mounted() {
		if (!this.callInitiated) {
			this.getPreCallMedia();
		}
	},
}).mount("#app");

const setTheme = (themeColor) => {
	if (!themeColor) return null;
	if (!/^[0-9A-F]{6}$/i.test(themeColor)) return alert("Invalid theme color");

	const textColor = parseInt(themeColor, 16) > 0xffffff / 2 ? "#000" : "#fff";

	document.documentElement.style.setProperty("--background", `#${themeColor}`);
	document.documentElement.style.setProperty("--text", textColor);
};

(async () => {
	const searchParams = new URLSearchParams(window.location.search);
	const themeColor = searchParams.get("theme");

	if (themeColor) setTheme(themeColor);

	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("/sw.js");
	}

	await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
	const devices = await navigator.mediaDevices.enumerateDevices();
	App.audioDevices = devices.filter((device) => device.kind === "audioinput");
	App.videoDevices = devices.filter((device) => device.kind === "videoinput");

	// Set default device ids
	const defaultAudioDeviceId = App.audioDevices.find((device) => device.deviceId == "default")?.deviceId;
	const defaultVideoDeviceId = App.videoDevices.find((device) => device.deviceId == "default")?.deviceId;

	App.selectedAudioDeviceId = defaultAudioDeviceId ?? App.audioDevices[0].deviceId;
	App.selectedVideoDeviceId = defaultVideoDeviceId ?? App.videoDevices[0].deviceId;
})();
