// Comprehensive stealth patches for headless Chrome detection evasion.
//
// This extension is the primary stealth mechanism because addInitScript
// does not work reliably on Playwright persistent contexts.
// It patches:
// 1. Navigator.prototype.webdriver — hides automation flag
// 2. Navigator.prototype.userAgent — removes HeadlessChrome
// 3. Navigator.prototype.userAgentData — consistent brands/versions
// 4. SharedWorker constructor — wraps with UA patches for worker contexts
// ServiceWorker UA is handled by --user-agent= Chromium flag (stealth.ts).
//
// Property descriptors use native-style getters with individually
// spoofed toString methods to avoid global Function.prototype.toString
// override which CreepJS detects across all prototype properties.
(() => {
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

	// WeakMap-based toString spoofing — no own properties on functions,
	// so hasOwnProperty('toString') returns false (matching native).
	var toStringMap = new WeakMap();
	var originalToString = Function.prototype.toString;
	var patchedToString = function toString() {
		var spoofed = toStringMap.get(this);
		if (spoofed !== undefined) return spoofed;
		return originalToString.call(this);
	};
	toStringMap.set(patchedToString, "function toString() { [native code] }");
	Function.prototype.toString = patchedToString;

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
		toStringMap.set(getter, "function get " + name + "() { [native code] }");
		return getter;
	}

	function makeNativeFunction(name, fn) {
		toStringMap.set(fn, "function " + name + "() { [native code] }");
		return fn;
	}

	// --- 1. navigator.webdriver → false ---
	Object.defineProperty(Navigator.prototype, "webdriver", {
		get: makeNativeGetter("webdriver", Navigator.prototype, () => false),
		configurable: true,
	});

	// --- 2. navigator.userAgent ---
	Object.defineProperty(Navigator.prototype, "userAgent", {
		get: makeNativeGetter("userAgent", Navigator.prototype, () => patchedUA),
		configurable: true,
	});

	// --- 3. navigator.userAgentData ---
	// Capture the original userAgentData and its getHighEntropyValues before
	// patching, so we can proxy real platform values (platformVersion,
	// architecture, bitness, model, wow64) while only overriding brands/UA.
	var origUAData = ("userAgentData" in navigator) ? navigator.userAgentData : null;
	var origGetHEV = origUAData ? origUAData.getHighEntropyValues.bind(origUAData) : null;

	// Fetch real high-entropy values before we patch. The promise resolves
	// as a microtask at document_start — well before any page script runs.
	var realHEVPromise = origGetHEV
		? origGetHEV(["platformVersion", "architecture", "bitness", "model", "wow64"])
		: Promise.resolve(null);

	if (origUAData) {
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

		var toJSON = makeNativeFunction("toJSON", function toJSON() {
			return { brands: brands, mobile: false, platform: uaDataPlatform };
		});

		var fakeUAData = {
			brands: brands,
			mobile: false,
			platform: uaDataPlatform,
			getHighEntropyValues: ghev,
			toJSON: toJSON,
		};

		// Set prototype so instanceof NavigatorUAData returns true
		if (typeof NavigatorUAData !== "undefined") {
			Object.setPrototypeOf(fakeUAData, NavigatorUAData.prototype);
		}

		Object.defineProperty(Navigator.prototype, "userAgentData", {
			get: makeNativeGetter("userAgentData", Navigator.prototype, () => fakeUAData),
			configurable: true,
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

	// --- 6. SharedWorker interception ---
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
			"try{Object.defineProperty(NP,'webdriver',{get:wg(function(){return false}),configurable:true})}catch(e){}",
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
