/* globals App */
// Client-side initialization for Ahey video chat
// Handles theme setup, service worker registration, and device enumeration

const setTheme = (themeColor) => {
	if (!themeColor) return null;
	if (!/^[0-9A-F]{6}$/i.test(themeColor)) return alert("Invalid theme color");

	const textColor = parseInt(themeColor, 16) > 0xffffff / 2 ? "#000" : "#fff";

	document.documentElement.style.setProperty("--background", `#${themeColor}`);
	document.documentElement.style.setProperty("--text", textColor);
};

const initializeApp = async () => {
	// Set theme from URL parameter
	const searchParams = new URLSearchParams(window.location.search);
	const themeColor = searchParams.get("theme");
	if (themeColor) setTheme(themeColor);

	// Register service worker for PWA functionality
	if ("serviceWorker" in navigator) {
		navigator.serviceWorker.register("/sw.js");
	}

	// Request media permissions and enumerate devices
	try {
		await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
		const devices = await navigator.mediaDevices.enumerateDevices();

		App.audioDevices = devices.filter((device) => device.kind === "audioinput");
		App.videoDevices = devices.filter((device) => device.kind === "videoinput");

		// Set default device ids
		const defaultAudioDeviceId = App.audioDevices.find((device) => device.deviceId == "default")?.deviceId;
		const defaultVideoDeviceId = App.videoDevices.find((device) => device.deviceId == "default")?.deviceId;

		App.selectedAudioDeviceId = defaultAudioDeviceId ?? App.audioDevices[0].deviceId;
		App.selectedVideoDeviceId = defaultVideoDeviceId ?? App.videoDevices[0].deviceId;
	} catch (error) {
		console.error("Failed to initialize media devices:", error);
	}
};

// Export for use in other modules
if (typeof module !== "undefined" && module.exports) {
	module.exports = { setTheme, initializeApp };
} else {
	// For browser usage, make it globally available
	window.setTheme = setTheme;
	window.initializeApp = initializeApp;
}
