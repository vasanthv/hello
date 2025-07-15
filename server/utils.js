/**
 * Checks whether a given string is a valid channel name.
 *
 * A valid channel name must:
 * - Be a string with a maximum length of 64 characters
 * - Contain only alphanumeric characters (a–z, A–Z, 0–9) and hyphens (-)
 * - Optionally start with '@'
 *
 * Examples of valid names:
 * - "channel-123"
 * - "@chat-channel"
 * - "hello-world"
 *
 * Examples of invalid names:
 * - "@"
 * - "invalid_name"     // contains underscore
 * - "channel!"            // contains exclamation mark
 * - "@a".repeat(65)    // exceeds 64 characters
 *
 * @param {string} name - The channel name to validate.
 * @returns {boolean} `true` if the name is valid; otherwise, `false`.
 */
function isValidChannelName(name) {
	const regex = /^@?[a-zA-Z0-9-]{1,63}$/;
	return typeof name === "string" && regex.test(name);
}

module.exports = { isValidChannelName };
