module.exports = {
	NODE_ENV: process.env.NODE_ENV,
	PORT: process.env.PORT ?? 824,
	CORS_ORIGIN: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : ["http://localhost:824"],
};
