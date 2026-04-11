// Comprehensive stealth patches for headless Chrome detection evasion.
//
// This extension is the primary stealth mechanism because addInitScript
// does not work reliably on Playwright persistent contexts.
// It patches:
// 1. Navigator.prototype.userAgent — removes HeadlessChrome
// 2. NavigatorUAData.prototype — overrides brands/mobile/platform getters
// 3. navigator.userAgentData.getHighEntropyValues — consistent versions
// 4. SharedWorker constructor — wraps with UA patches for worker contexts
// 5. navigator.connection.downlinkMax — spoofs for headless
// 6. Background colour — sets non-default bg to avoid headless detection
// Note: navigator.webdriver is handled entirely by --disable-blink-features=AutomationControlled
// ServiceWorker UA is handled by --user-agent= Chromium flag (stealth.ts).
//
// Property descriptors use native-style getters without monkey-patching
// Function.prototype.toString, which CreepJS can detect across realms.
(() => {
	try { window.__stealthExtensionStarted = true; } catch (_) {}
	// Read the current UA. If CDP Emulation.setUserAgentOverride has already
	// replaced HeadlessChrome, the native getter returns the clean UA.
	// We always apply patches since they're harmless in non-headless Chrome
	// (they just re-set the UA to its current value).
	var currentUA = navigator.userAgent;
	var patchedUA = currentUA.replace("HeadlessChrome", "Chrome");
	var chromeMajorMatch = patchedUA.match(/Chrome\/(\d+)/);
	var chromeMajor = chromeMajorMatch ? chromeMajorMatch[1] : "0";
	var chromeFullMatch = patchedUA.match(/Chrome\/(\d+\.\d+\.\d+\.\d+)/);
	var chromeFullVersion = chromeFullMatch ? chromeFullMatch[1] : chromeMajor + ".0.0.0";
	var navPlatform = navigator.platform;
	var uaDataPlatform =
		navPlatform === "MacIntel"
			? "macOS"
			: navPlatform === "Win32"
				? "Windows"
				: "Linux";

	function makeNativeGetter(name, proto, valueFn) {
		var getter = function () {
			// Reject non-objects (primitives, null, undefined)
			if (this == null || (typeof this !== "object" && typeof this !== "function")) {
				throw new TypeError("Illegal invocation");
			}
			// Walk the prototype chain to check if proto is an ancestor,
			// matching native getter behaviour without relying on instanceof
			// (which can fail across extension/page execution contexts).
			var p = Object.getPrototypeOf(this);
			while (p !== null) {
				if (p === proto) return valueFn();
				p = Object.getPrototypeOf(p);
			}
			throw new TypeError("Illegal invocation");
		};
		return getter;
	}

	function makeNativeFunction(name, fn) {
		void name;
		return fn;
	}

	// --- 1. navigator.userAgent ---
	Object.defineProperty(Navigator.prototype, "userAgent", {
		get: makeNativeGetter("userAgent", Navigator.prototype, () => patchedUA),
		configurable: true,
	});

	// --- 2. navigator.userAgentData ---
	// Override getters directly on NavigatorUAData.prototype rather than
	// creating a fake object. This ensures the real navigator.userAgentData
	// instance (which the browser/CDP may recreate) always returns our values.
	// Capture real high-entropy values before patching.
	var origUAData = ("userAgentData" in navigator) ? navigator.userAgentData : null;
	var origGetHEV = origUAData ? origUAData.getHighEntropyValues.bind(origUAData) : null;

	var realHEVPromise = origGetHEV
		? origGetHEV(["platformVersion", "architecture", "bitness", "model", "wow64"])
		: Promise.resolve(null);

	if (origUAData && typeof NavigatorUAData !== "undefined") {
		var brands = [
			{ brand: "Chromium", version: chromeMajor },
			{ brand: "Google Chrome", version: chromeMajor },
			{ brand: "Not-A.Brand", version: "8" },
		];
		var fullVersionList = [
			{ brand: "Chromium", version: chromeFullVersion },
			{ brand: "Google Chrome", version: chromeFullVersion },
			{ brand: "Not-A.Brand", version: "8.0.0.0" },
		];

		// Override the prototype getters so ALL NavigatorUAData instances
		// (including ones the browser recreates) return our spoofed values.
		var uadProto = NavigatorUAData.prototype;
		Object.defineProperty(uadProto, "brands", {
			get: makeNativeGetter("brands", uadProto, function() { return brands; }),
			configurable: true,
			enumerable: true,
		});
		Object.defineProperty(uadProto, "mobile", {
			get: makeNativeGetter("mobile", uadProto, function() { return false; }),
			configurable: true,
			enumerable: true,
		});
		Object.defineProperty(uadProto, "platform", {
			get: makeNativeGetter("platform", uadProto, function() { return uaDataPlatform; }),
			configurable: true,
			enumerable: true,
		});

		var ghev = makeNativeFunction(
			"getHighEntropyValues",
			function getHighEntropyValues(hints) {
				return realHEVPromise.then(function (realValues) {
					var base = {
						brands: brands,
						fullVersionList: fullVersionList,
						mobile: false,
						platform: uaDataPlatform,
						platformVersion: realValues ? realValues.platformVersion : "0.0.0",
						architecture: realValues ? realValues.architecture : "x86",
						bitness: realValues ? realValues.bitness : "64",
						model: realValues ? realValues.model : "",
						uaFullVersion: chromeFullVersion,
						wow64: realValues ? realValues.wow64 : false,
					};
					if (!hints || hints.length === 0) {
						return Object.assign({}, base);
					}
					var result = {
						brands: brands,
						mobile: false,
						platform: uaDataPlatform,
					};
					for (var i = 0; i < hints.length; i++) {
						if (hints[i] in base) {
							result[hints[i]] = base[hints[i]];
						}
					}
					return result;
				});
			},
		);

		uadProto.getHighEntropyValues = ghev;
		uadProto.toJSON = makeNativeFunction("toJSON", function toJSON() {
			return { brands: brands, mobile: false, platform: uaDataPlatform };
		});
	}

	// --- 4. Remove Playwright globals that fpscanner detects ---
	try { delete window.__pwInitScripts; } catch (_) {}
	try { delete window.__playwright__binding__; } catch (_) {}

	// --- 5. chrome.app stub ---
	// Headless Chrome may be missing chrome.app, which detection scripts check.
	if (typeof chrome !== "undefined") {
		if (!chrome.app) {
			chrome.app = {};
		}
		var app = chrome.app;
		if (!("isInstalled" in app)) {
			app.isInstalled = false;
		}
		if (!("getDetails" in app)) {
			app.getDetails = makeNativeFunction("getDetails", function getDetails() { return null; });
		}
		if (!("getIsInstalled" in app)) {
			app.getIsInstalled = makeNativeFunction("getIsInstalled", function getIsInstalled() { return false; });
		}
		if (!("installState" in app)) {
			app.installState = makeNativeFunction("installState", function installState(callback) {
				if (callback) callback("disabled");
			});
		}
		if (!("runningState" in app)) {
			app.runningState = makeNativeFunction("runningState", function runningState() { return "cannot_run"; });
		}
	}

	// --- 6. chrome.runtime stub ---
	// Real Chrome always exposes chrome.runtime, even without extensions.
	if (typeof chrome !== "undefined") {
		if (!chrome.runtime) {
			chrome.runtime = {};
		}
		var rt = chrome.runtime;

		// Helper to create Chrome-style event objects
		function createChromeEvent() {
			var listeners = [];
			return {
				addListener: makeNativeFunction("addListener", function addListener(callback) {
					listeners.push(callback);
				}),
				removeListener: makeNativeFunction("removeListener", function removeListener(callback) {
					var idx = listeners.indexOf(callback);
					if (idx > -1) listeners.splice(idx, 1);
				}),
				hasListener: makeNativeFunction("hasListener", function hasListener(callback) {
					return listeners.indexOf(callback) > -1;
				}),
				hasListeners: makeNativeFunction("hasListeners", function hasListeners() {
					return listeners.length > 0;
				}),
			};
		}

		// Properties
		if (!("id" in rt)) rt.id = undefined;
		if (!("lastError" in rt)) rt.lastError = undefined;

		// Methods
		if (!("getManifest" in rt)) {
			rt.getManifest = makeNativeFunction("getManifest", function getManifest() { return {}; });
		}
		if (!("getURL" in rt)) {
			rt.getURL = makeNativeFunction("getURL", function getURL(path) {
				return "chrome-extension://invalid/" + (path || "");
			});
		}
		if (!("getPlatformInfo" in rt)) {
			rt.getPlatformInfo = makeNativeFunction("getPlatformInfo", function getPlatformInfo(callback) {
				var info = {
					os: navigator.platform.indexOf("Win") > -1 ? "win" : 
						navigator.platform.indexOf("Mac") > -1 ? "mac" : 
						navigator.platform.indexOf("Linux") > -1 ? "linux" : "unknown",
					arch: "x86-64",
					nacl_arch: "x86-64",
				};
				if (callback) callback(info);
				return Promise.resolve(info);
			});
		}
		if (!("getVersion" in rt)) {
			rt.getVersion = makeNativeFunction("getVersion", function getVersion() { return "0"; });
		}
		if (!("reload" in rt)) {
			rt.reload = makeNativeFunction("reload", function reload() { window.location.reload(); });
		}
		if (!("openOptionsPage" in rt)) {
			rt.openOptionsPage = makeNativeFunction("openOptionsPage", function openOptionsPage(callback) {
				if (callback) callback();
				return Promise.resolve();
			});
		}
		if (!("setUninstallURL" in rt)) {
			rt.setUninstallURL = makeNativeFunction("setUninstallURL", function setUninstallURL(url, callback) {
				if (callback) callback();
				return Promise.resolve();
			});
		}
		if (!("connect" in rt)) {
			rt.connect = makeNativeFunction("connect", function connect() {
				throw new Error("Could not establish connection. Receiving end does not exist.");
			});
		}
		if (!("sendMessage" in rt)) {
			rt.sendMessage = makeNativeFunction("sendMessage", function sendMessage() {
				throw new Error("Could not establish connection. Receiving end does not exist.");
			});
		}
		if (!("connectNative" in rt)) {
			rt.connectNative = makeNativeFunction("connectNative", function connectNative() {
				throw new Error("Access to native messaging requires the nativeMessaging permission.");
			});
		}
		if (!("sendNativeMessage" in rt)) {
			rt.sendNativeMessage = makeNativeFunction("sendNativeMessage", function sendNativeMessage() {
				throw new Error("Access to native messaging requires the nativeMessaging permission.");
			});
		}

		// Events
		if (!("onMessage" in rt)) rt.onMessage = createChromeEvent();
		if (!("onConnect" in rt)) rt.onConnect = createChromeEvent();
		if (!("onInstalled" in rt)) rt.onInstalled = createChromeEvent();
		if (!("onStartup" in rt)) rt.onStartup = createChromeEvent();
		if (!("onSuspend" in rt)) rt.onSuspend = createChromeEvent();
		if (!("onMessageExternal" in rt)) rt.onMessageExternal = createChromeEvent();
		if (!("onConnectExternal" in rt)) rt.onConnectExternal = createChromeEvent();
	}

	// --- 7. navigator.connection.downlinkMax ---
	// In headless environments, NetworkInformation.downlinkMax is missing,
	// which CreepJS uses as a headless signal. Real Chrome on Wi-Fi reports
	// Infinity; on ethernet it varies. Spoof it to match Wi-Fi.
	if (typeof navigator.connection !== "undefined") {
		var conn = navigator.connection;
		if (!("downlinkMax" in conn) || conn.downlinkMax === undefined) {
			Object.defineProperty(Object.getPrototypeOf(conn), "downlinkMax", {
				get: makeNativeGetter("downlinkMax", Object.getPrototypeOf(conn), function() { return Infinity; }),
				configurable: true,
				enumerable: true,
			});
		}
	}

	// --- 8. Background colour is handled via CDP
	// Emulation.setDefaultBackgroundColorOverride in daemon.ts.

	// --- 9. Screen dimensions ---
	// Headless sets screen dimensions to match the viewport exactly, which
	// triggers two CreepJS flags: noTaskbar (availHeight === height) and
	// hasVvpScreenRes (viewport === screen). Fix both by spoofing screen
	// dimensions to a common monitor resolution and subtracting OS chrome.
	// Note: We always spoof screen dimensions unconditionally to ensure
	// headless detection signals are consistently masked.
	var spoofedW = navPlatform === "MacIntel" ? 1920
		: navPlatform === "Win32" ? 1920 : 1920;
	var spoofedH = navPlatform === "MacIntel" ? 1080
		: navPlatform === "Win32" ? 1080 : 1080;

	var dockOffset = navPlatform === "MacIntel" ? 74
		: navPlatform === "Win32" ? 40 : 37;
	var menuBarOffset = navPlatform === "MacIntel" ? 37 : 0;
	var totalOffset = dockOffset + menuBarOffset;

	Object.defineProperty(Screen.prototype, "width", {
		get: makeNativeGetter("width", Screen.prototype,
			function() { return spoofedW; }),
		configurable: true,
	});
	Object.defineProperty(Screen.prototype, "height", {
		get: makeNativeGetter("height", Screen.prototype,
			function() { return spoofedH; }),
		configurable: true,
	});
	Object.defineProperty(Screen.prototype, "availWidth", {
		get: makeNativeGetter("availWidth", Screen.prototype,
			function() { return spoofedW; }),
		configurable: true,
	});
	Object.defineProperty(Screen.prototype, "availHeight", {
		get: makeNativeGetter("availHeight", Screen.prototype,
			function() { return spoofedH - totalOffset; }),
		configurable: true,
	});
	Object.defineProperty(Screen.prototype, "availTop", {
		get: makeNativeGetter("availTop", Screen.prototype,
			function() { return menuBarOffset; }),
		configurable: true,
	});

	// --- 9b. Override getComputedStyle to fix ActiveText system color detection ---
	// CreepJS detects hasKnownBgColor by checking if ActiveText resolves to red (rgb(255,0,0)),
	// which is a headless Chrome signature. We intercept getComputedStyle and return
	// a normal colour (black) when the computed background color is red.
	try {
		window.__getComputedStylePatchLoaded = true;
		var originalGetComputedStyle = window.getComputedStyle;
		window.getComputedStyle = function getComputedStyle(elem, pseudoElt) {
			var style = originalGetComputedStyle.call(window, elem, pseudoElt);

			// Always wrap in proxy to intercept backgroundColor access
			// This handles both ActiveText detection and any other cases where
			// the browser returns red as the default background
			return new Proxy(style, {
				get: function(target, prop) {
					var value = target[prop];
					// If the computed background color is red (headless signature), return black
					if (prop === "backgroundColor" && value === "rgb(255, 0, 0)") {
						return "rgb(0, 0, 0)"; // Return black instead of red
					}
					return value;
				}
			});
		};
	} catch (e) {
		window.__getComputedStylePatchError = e.message;
	}

	// --- 10. SharedWorker interception ---
	// Note: ServiceWorker UA is handled by the --user-agent= Chromium flag
	// at the browser process level (see stealthArgs in stealth.ts).
	// Blob URLs cannot register ServiceWorkers, so JS-level interception
	// is not viable for SW contexts.

	// Build worker patch code after real high-entropy values resolve, so
	// workers get accurate platform values instead of hardcoded defaults.
	realHEVPromise.then(function (realValues) {
		var hev = {
			platformVersion: realValues ? realValues.platformVersion : "0.0.0",
			architecture: realValues ? realValues.architecture : "x86",
			bitness: realValues ? realValues.bitness : "64",
			model: realValues ? realValues.model : "",
			wow64: realValues ? realValues.wow64 : false,
		};

		var workerPatchCode = [
			"(function(){",
			"var ua=" + JSON.stringify(patchedUA) + ";",
		"var cm=" + JSON.stringify(chromeMajor) + ";",
		"var cfv=" + JSON.stringify(chromeFullVersion) + ";",
		"var plat=" + JSON.stringify(uaDataPlatform) + ";",
		"var hev=" + JSON.stringify(hev) + ";",
		"var brands=[{brand:'Chromium',version:cm},{brand:'Google Chrome',version:cm},{brand:'Not-A.Brand',version:'8'}];",
		"var NP=Object.getPrototypeOf(navigator);",
		"var NPCtor=NP.constructor;",
		"function wg(fn){return function(){if(!(this instanceof NPCtor))throw new TypeError('Illegal invocation');return fn()}}",
		"try{Object.defineProperty(NP,'userAgent',{get:wg(function(){return ua}),configurable:true})}catch(e){}",
		// Note: navigator.webdriver is handled entirely by --disable-blink-features=AutomationControlled
		// Deleting or modifying it here creates detectable signatures that CreepJS can detect.
		"try{if('userAgentData' in navigator){",
			"  var fvl=[{brand:'Chromium',version:cfv},{brand:'Google Chrome',version:cfv},{brand:'Not-A.Brand',version:'8.0.0.0'}];",
			"  var fakeUAData={brands:brands,mobile:false,platform:plat,",
			"    getHighEntropyValues:function(h){var r={brands:brands,mobile:false,platform:plat,fullVersionList:fvl,uaFullVersion:cfv,platformVersion:hev.platformVersion,architecture:hev.architecture,bitness:hev.bitness,model:hev.model,wow64:hev.wow64};if(!h)return Promise.resolve(r);var o={brands:brands,mobile:false,platform:plat};for(var i=0;i<h.length;i++){if(h[i] in r)o[h[i]]=r[h[i]]}return Promise.resolve(o)},",
			"    toJSON:function(){return{brands:brands,mobile:false,platform:plat}}",
			"  };",
			"  Object.defineProperty(NP,'userAgentData',{get:wg(function(){return fakeUAData}),configurable:true})",
			"}}catch(e){}",
			"})();",
		].join("\n");

		// SharedWorker interception
		if (typeof SharedWorker !== "undefined") {
		try {
		var OrigSharedWorker = SharedWorker;

		var PatchedSharedWorker = makeNativeFunction(
			"SharedWorker",
			function SharedWorker(scriptURL, options) {
				var resolvedURL;
				try {
					resolvedURL = new URL(scriptURL, location.href).href;
				} catch (_) {
					return new OrigSharedWorker(scriptURL, options);
				}

				var wrapperCode;
				if (options && options.type === "module") {
					wrapperCode =
						workerPatchCode +
						"\nimport(" +
						JSON.stringify(resolvedURL) +
						");";
				} else {
					wrapperCode =
						workerPatchCode +
						"\nimportScripts(" +
						JSON.stringify(resolvedURL) +
						");";
				}

				var blob = new Blob([wrapperCode], {
					type: "application/javascript",
				});
				var blobURL = URL.createObjectURL(blob);

				try {
					var newOpts = options ? Object.assign({}, options) : undefined;
					return new OrigSharedWorker(blobURL, newOpts);
				} finally {
					setTimeout(() => {
						URL.revokeObjectURL(blobURL);
					}, 1000);
				}
			},
		);

		PatchedSharedWorker.prototype = OrigSharedWorker.prototype;
		Object.defineProperty(PatchedSharedWorker, "name", {
			value: "SharedWorker",
			configurable: true,
		});

		window.SharedWorker = PatchedSharedWorker;
		} catch (_) {
			// SharedWorker may not be available in all contexts
		}
		}
	});
})();
