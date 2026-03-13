// Fix CDP Input.dispatchMouseEvent screenX/screenY leak in cross-origin iframes.
// When Playwright dispatches mouse events via CDP, screenX/screenY are reported
// relative to the iframe widget origin instead of the screen. Cloudflare Turnstile
// detects this as the coordinates are suspiciously small. This script overrides
// the MouseEvent prototype to return plausible screen-relative values.
//
// Only activates inside iframes to avoid altering coordinates in the top frame
// where they are already correct.
(() => {
	if (window === window.top) return;

	// Plausible screen offsets — generated once per frame load for consistency
	// within a single page session but varying across navigations.
	var offsetX = 200 + Math.floor(Math.random() * 800);
	var offsetY = 150 + Math.floor(Math.random() * 400);

	var origScreenX = Object.getOwnPropertyDescriptor(
		MouseEvent.prototype,
		"screenX",
	);
	var origScreenY = Object.getOwnPropertyDescriptor(
		MouseEvent.prototype,
		"screenY",
	);

	Object.defineProperty(MouseEvent.prototype, "screenX", {
		configurable: true,
		enumerable: true,
		get: function () {
			var base =
				origScreenX && origScreenX.get ? origScreenX.get.call(this) : 0;
			return base + offsetX;
		},
	});

	Object.defineProperty(MouseEvent.prototype, "screenY", {
		configurable: true,
		enumerable: true,
		get: function () {
			var base =
				origScreenY && origScreenY.get ? origScreenY.get.call(this) : 0;
			return base + offsetY;
		},
	});
})();
