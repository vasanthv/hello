/* globals Vue */

"use strict";

const App = Vue.createApp({
	data() {
		const channelId = window.location.pathname.substr(1);
		const channelLink = `${window.location.origin}/${channelId}`;
		const searchParams = new URLSearchParams(window.location.search);

		const name = searchParams.get("name");

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
			selectedAudioDeviceId: "",
			name: name ?? window.localStorage.name,
			callInitiated: false,
			localMediaStream: null,
			peers: {},
			dataChannels: {},
			chats: [],
			chatMessage: "",
			showChat: false,
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
		peerKeys() {
			return Object.keys(this.peers);
		},
		peerList() {
			return Object.keys(this.peers).map((peer) => ({
				name: this.peers[peer].data.peerName,
				isTalking: this.peers[peer].data.isTalking,
			}));
		},
	},
	methods: {
		initiateCall() {
			if (!this.channelId) return alert("Invalid channel id");

			if (!this.name) return;

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
		changeMicrophone() {
			const deviceId = this.selectedAudioDeviceId;
			navigator.mediaDevices
				.getUserMedia({ audio: { deviceId } })
				.then((micStream) => {
					for (let peer_id in this.peers) {
						const sender = this.peers[peer_id]["rtc"]
							.getSenders()
							.find((s) => (s.track ? s.track.kind === "audio" : false));
						sender.replaceTrack(micStream.getAudioTracks()[0]);
					}
					micStream.getAudioTracks()[0].enabled = this.audioEnabled;

					const newStream = new MediaStream([micStream.getAudioTracks()[0]]);
					this.localMediaStream = newStream;
				})
				.catch((err) => {
					console.log(err);
					this.setToast("Error while swaping microphone");
				});
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

(() => {
	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("/sw.js");
	}
})();
