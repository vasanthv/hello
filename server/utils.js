/**
 * Checks whether a given string is a valid room name.
 *
 * A valid room name must:
 * - Be a string with a maximum length of 64 characters
 * - Contain only alphanumeric characters (a–z, A–Z, 0–9) and hyphens (-)
 * - Optionally start with '@'
 *
 * Examples of valid names:
 * - "room-123"
 * - "@chat-room"
 * - "hello-world"
 *
 * Examples of invalid names:
 * - "@"
 * - "invalid_name"     // contains underscore
 * - "room!"            // contains exclamation mark
 * - "@a".repeat(65)    // exceeds 64 characters
 *
 * @param {string} name - The room name to validate.
 * @returns {boolean} `true` if the name is valid; otherwise, `false`.
 */
function isValidRoomName(name) {
	const regex = /^@?[a-zA-Z0-9-]{1,63}$/;
	return typeof name === "string" && regex.test(name);
}

module.exports = { isValidRoomName };
