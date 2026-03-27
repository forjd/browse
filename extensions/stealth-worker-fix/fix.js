// Comprehensive stealth patches for headless Chrome detection evasion.
//
// This extension is the primary stealth mechanism because addInitScript
// does not work reliably on Playwright persistent contexts.
// It patches:
// 1. Navigator.prototype.userAgent — removes HeadlessChrome
// 2. Navigator.prototype.userAgentData — consistent brands/versions
// 3. SharedWorker constructor — wraps with UA patches for worker contexts
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
	var navPlatform = navigator.platform;
	var uaDataPlatform =
		navPlatform === "MacIntel"
			? "macOS"
			: navPlatform === "Win32"
				? "Windows"
				: "Linux";

	// Helper: create a getter function with a spoofed toString that
	// looks like a native getter. Does NOT modify Function.prototype.toString.
	var nativeToString = Function.prototype.toString;
	function makeNativeGetter(name, valueFn) {
		var getter = () => valueFn();
		// Spoof toString on the individual function instance
		getter.toString = () => "function get " + name + "() { [native code] }";
		// Also spoof the toString's own toString to look native
		getter.toString.toString = nativeToString.bind(nativeToString);
		return getter;
	}

	function makeNativeFunction(name, fn) {
		fn.toString = () => "function " + name + "() { [native code] }";
		fn.toString.toString = nativeToString.bind(nativeToString);
		return fn;
	}

	// --- 1. navigator.userAgent ---
	Object.defineProperty(Navigator.prototype, "userAgent", {
		get: makeNativeGetter("userAgent", () => patchedUA),
		configurable: true,
	});

	// --- 2. navigator.userAgentData ---
	if ("userAgentData" in navigator) {
		var brands = [
			{ brand: "Chromium", version: chromeMajor },
			{ brand: "Google Chrome", version: chromeMajor },
			{ brand: "Not-A.Brand", version: "8" },
		];
		var fullVersionList = [
			{ brand: "Chromium", version: chromeMajor + ".0.0.0" },
			{ brand: "Google Chrome", version: chromeMajor + ".0.0.0" },
			{ brand: "Not-A.Brand", version: "8.0.0.0" },
		];

		var allHighEntropy = {
			brands: brands,
			fullVersionList: fullVersionList,
			mobile: false,
			platform: uaDataPlatform,
			platformVersion: "0.0.0",
			architecture: "x86",
			bitness: "64",
			model: "",
			uaFullVersion: chromeMajor + ".0.0.0",
			wow64: false,
		};

		var ghev = makeNativeFunction(
			"getHighEntropyValues",
			function getHighEntropyValues(hints) {
				if (!hints || hints.length === 0) {
					return Promise.resolve(Object.assign({}, allHighEntropy));
				}
				var result = {
					brands: brands,
					mobile: false,
					platform: uaDataPlatform,
				};
				for (var i = 0; i < hints.length; i++) {
					if (hints[i] in allHighEntropy) {
						result[hints[i]] = allHighEntropy[hints[i]];
					}
				}
				return Promise.resolve(result);
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

		Object.defineProperty(Navigator.prototype, "userAgentData", {
			get: makeNativeGetter("userAgentData", () => fakeUAData),
			configurable: true,
		});
	}

	// --- 3. SharedWorker interception ---
	// Note: ServiceWorker UA is handled by the --user-agent= Chromium flag
	// at the browser process level (see stealthArgs in stealth.ts).
	// Blob URLs cannot register ServiceWorkers, so JS-level interception
	// is not viable for SW contexts.

	// Build self-contained patch code for injection into worker contexts
	var workerPatchCode = [
		"(function(){",
		"var ua=" + JSON.stringify(patchedUA) + ";",
		"var cm=" + JSON.stringify(chromeMajor) + ";",
		"var plat=" + JSON.stringify(uaDataPlatform) + ";",
		"var brands=[{brand:'Chromium',version:cm},{brand:'Google Chrome',version:cm},{brand:'Not-A.Brand',version:'8'}];",
		"var NP=Object.getPrototypeOf(navigator);",
		"try{Object.defineProperty(NP,'userAgent',{get:function(){return ua},configurable:true})}catch(e){}",
		"try{Object.defineProperty(NP,'webdriver',{get:function(){return false},configurable:true})}catch(e){}",
		"try{if('userAgentData' in navigator){",
		"  var fvl=[{brand:'Chromium',version:cm+'.0.0.0'},{brand:'Google Chrome',version:cm+'.0.0.0'},{brand:'Not-A.Brand',version:'8.0.0.0'}];",
		"  var fakeUAData={brands:brands,mobile:false,platform:plat,",
		"    getHighEntropyValues:function(h){var r={brands:brands,mobile:false,platform:plat,fullVersionList:fvl,uaFullVersion:cm+'.0.0.0',platformVersion:'0.0.0',architecture:'x86',bitness:'64',model:'',wow64:false};if(!h)return Promise.resolve(r);var o={brands:brands,mobile:false,platform:plat};for(var i=0;i<h.length;i++){if(h[i] in r)o[h[i]]=r[h[i]]}return Promise.resolve(o)},",
		"    toJSON:function(){return{brands:brands,mobile:false,platform:plat}}",
		"  };",
		"  Object.defineProperty(NP,'userAgentData',{get:function(){return fakeUAData},configurable:true})",
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
})();
