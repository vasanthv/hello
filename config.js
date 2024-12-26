module.exports = {
	NODE_ENV: process.env.NODE_ENV,
	PORT: process.env.PORT || 3000,
	URL: process.env.NODE_ENV === "production" ? "https://hello.vasanthv.me/" : "http://localhost:3000/",
	CORS_ORIGIN: "https://hello.vasanthv.me:*,http://localhost:3000*",
};
