const { isValidChannelName } = require("./utils");

const router = require("express").Router();

const STATIC_VIEWS = {
	privacy: "Privacy policy",
	terms: "Terms of service",
};

// Route: Home page
router.get("/", (req, res) => res.render("index", { page: "index", title: "A free video chat for the web." }));

// MIddleware: Static views (terms, privacy, etc.)
router.use("/:view", (req, res, next) => {
	const view = req.params.view;
	if (STATIC_VIEWS[view]) {
		return res.render(view, { page: view, title: STATIC_VIEWS[view] });
	}
	next();
});

// Route: Room page (dynamic)
router.get("/:channel", (req, res) => {
	const channel = req.params.channel;
	if (!isValidChannelName(channel)) {
		return res.status(400).render("invalid", { page: "invalid-channel", title: "Invalid channel" });
	}

	res.render("channel", { page: "channel", title: channel });
});

// Route: Catch-all for 404 errors
router.use(["/*", "/404"], (req, res) => res.status(404).render("404", { page: "404", title: "Page not found" }));

module.exports = router;
