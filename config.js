module.exports = {
	NODE_ENV: process.env.NODE_ENV,
	PORT: process.env.PORT || 824,
	CORS_ORIGIN: "https://ahey.net:*,http://localhost:824*",
	STATIC_VIEWS: {
		"/faq": "Frequently asked questions",
		"/privacy": "Privacy policy",
	},
};
