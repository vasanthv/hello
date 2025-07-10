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
					isMuted = this.peers[peer].stream.getAudioTracks()[0].muted;
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
			if (newDeviceId !== oldDeviceId && this.callInitiated) {
				this.switchAudioDevice(newDeviceId);
			}
		},
		selectedVideoDeviceId(newDeviceId, oldDeviceId) {
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

				// Replace the audio track in the local stream
				const newAudioTrack = newStream.getAudioTracks()[0];
				if (this.localMediaStream && newAudioTrack) {
					this.localMediaStream.removeTrack(this.localMediaStream.getAudioTracks()[0]);
					this.localMediaStream.addTrack(newAudioTrack);
				}

				// Update all peer connections with the new audio track
				Object.keys(this.peers).forEach((peerId) => {
					const peerConnection = this.peers[peerId].rtc;
					const senders = peerConnection.getSenders();
					const audioSender = senders.find((sender) => sender.track && sender.track.kind === "audio");

					if (audioSender) {
						audioSender.replaceTrack(newAudioTrack);
					}
				});

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

				// Replace the video track in the local stream
				const newVideoTrack = newStream.getVideoTracks()[0];
				if (this.localMediaStream && newVideoTrack) {
					this.localMediaStream.removeTrack(this.localMediaStream.getVideoTracks()[0]);
					this.localMediaStream.addTrack(newVideoTrack);
				}

				// Update all peer connections with the new video track
				Object.keys(this.peers).forEach((peerId) => {
					const peerConnection = this.peers[peerId].rtc;
					const senders = peerConnection.getSenders();
					const videoSender = senders.find((sender) => sender.track && sender.track.kind === "video");

					if (videoSender) {
						videoSender.replaceTrack(newVideoTrack);
					}
				});

				this.setToast("Video device changed successfully", "success");
			} catch (error) {
				console.error("Error switching video device:", error);
				this.setToast("Failed to switch video device");
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

				// Replace video track in all peer connections
				const screenVideoTrack = screenStream.getVideoTracks()[0];
				Object.keys(this.peers).forEach((peerId) => {
					const peerConnection = this.peers[peerId].rtc;
					const senders = peerConnection.getSenders();
					const videoSender = senders.find((sender) => sender.track && sender.track.kind === "video");

					if (videoSender) {
						videoSender.replaceTrack(screenVideoTrack);
					}
				});

				// Update local video element to show screen share
				if (this.localMediaStream) {
					const oldVideoTrack = this.localMediaStream.getVideoTracks()[0];
					if (oldVideoTrack) {
						this.localMediaStream.removeTrack(oldVideoTrack);
					}
					this.localMediaStream.addTrack(screenVideoTrack);
				}

				this.setToast("Screen sharing started", "success");
			} catch (error) {
				console.error("Error starting screen share:", error);
				if (error.name === "NotAllowedError") {
					this.setToast("Screen sharing permission denied");
				} else if (error.name === "NotSupportedError") {
					this.setToast("Screen sharing not supported in this browser");
				} else if (error.name === "AbortError") {
					// User cancelled the screen share dialog
					console.log("Screen share cancelled by user");
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

				console.log(this.selectedVideoDeviceId);
				// Get new video stream with the selected video device
				const newVideoStream = await navigator.mediaDevices.getUserMedia({
					audio: false,
					video: { deviceId: { exact: this.selectedVideoDeviceId } },
				});

				console.log(newVideoStream);
				// Replace video track in all peer connections
				const newVideoTrack = newVideoStream.getVideoTracks()[0];
				console.log(newVideoTrack);
				Object.keys(this.peers).forEach((peerId) => {
					const peerConnection = this.peers[peerId].rtc;
					const senders = peerConnection.getSenders();
					const videoSender = senders.find((sender) => sender.track && sender.track.kind === "video");

					if (videoSender) {
						videoSender.replaceTrack(newVideoTrack);
					}
				});

				// Update local video element to show camera
				if (this.localMediaStream) {
					const oldVideoTrack = this.localMediaStream.getVideoTracks()[0];
					if (oldVideoTrack) {
						this.localMediaStream.removeTrack(oldVideoTrack);
					}
					this.localMediaStream.addTrack(newVideoTrack);
				}

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
		toggleAudio(e) {
			e.stopPropagation();
			this.localMediaStream.getAudioTracks()[0].enabled = !this.localMediaStream.getAudioTracks()[0].enabled;
			this.audioEnabled = !this.audioEnabled;
		},
		toggleVideo(e) {
			e.stopPropagation();
			this.localMediaStream.getVideoTracks()[0].enabled = !this.localMediaStream.getVideoTracks()[0].enabled;
			this.videoEnabled = !this.videoEnabled;
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
