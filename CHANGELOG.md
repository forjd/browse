# Changelog

## [0.9.1](https://github.com/forjd/browse/compare/browse-v0.9.0...browse-v0.9.1) (2026-03-18)


### Bug Fixes

* install.sh should install chrome, not chromium ([c150e1d](https://github.com/forjd/browse/commit/c150e1da9ee766ab6f23d1fcebea687b1806c99b))

## [0.9.0](https://github.com/forjd/browse/compare/browse-v0.8.2...browse-v0.9.0) (2026-03-18)


### Features

* add --base-url support to assert-ai for OpenAI-compatible providers ([3e776d9](https://github.com/forjd/browse/commit/3e776d9077e54f24bdc7a0c34212e836a9ac9377))
* add --dry-run flag to screenshots clean ([9de3eb5](https://github.com/forjd/browse/commit/9de3eb5bb88a43fa9fcb017e8fe4060522401d06)), closes [#62](https://github.com/forjd/browse/issues/62)
* implement all Tier 3 extraordinary features ([#19](https://github.com/forjd/browse/issues/19)-[#25](https://github.com/forjd/browse/issues/25)) ([a727577](https://github.com/forjd/browse/commit/a727577afc51f7bce266a138604f70be86c32755))


### Bug Fixes

* ad-hoc codesign macOS binaries after Bun compile ([1092d94](https://github.com/forjd/browse/commit/1092d943bfc2bb5ac0f467acec2fdfb4f44f5e29))
* add --data to form command's KNOWN_FLAGS ([36472b8](https://github.com/forjd/browse/commit/36472b842b2d68cb77e5c4795ccb3348916106e2))
* address CodeRabbit review feedback on Tier 3 features ([223974d](https://github.com/forjd/browse/commit/223974d931f5fb125e51238878d044bf9c0ecc6d))
* address remaining CodeRabbit inline, duplicate, and nitpick comments ([506dff8](https://github.com/forjd/browse/commit/506dff8760a11f32d0e953a31a37de2ca41d57ef))
* address review — correct stale comment and validate CDP response ([3829e5e](https://github.com/forjd/browse/commit/3829e5e1258023c9f45cecb2c9dbf9f8e9ec07d1))
* allow spaces in flow variable interpolation syntax ([a75b250](https://github.com/forjd/browse/commit/a75b25089bd5c8702e64cd6c2a2949ee58691c1b)), closes [#47](https://github.com/forjd/browse/issues/47)
* capture console messages from user JavaScript via CDP ([ef738f0](https://github.com/forjd/browse/commit/ef738f03845f435a6a3ffd7683ca129b97a6713f)), closes [#50](https://github.com/forjd/browse/issues/50)
* correct onExit JSDoc and extract test poll helper ([6527874](https://github.com/forjd/browse/commit/6527874dd76c81433a941e76a18239c4d4949a1a))
* detect navigation after press and warn in response ([ec29173](https://github.com/forjd/browse/commit/ec2917353cd982b5c4d8790de7f0e7981f0a88f4)), closes [#56](https://github.com/forjd/browse/issues/56)
* exit 0 when showing help for no-args invocation ([3b096a7](https://github.com/forjd/browse/commit/3b096a71b1a4c7b933c6d764d8b7618eea3a5669))
* extract global flags before command name in parseArgs ([6123ec0](https://github.com/forjd/browse/commit/6123ec007ebde8168e8070f7ffc6906f5ced7f12))
* guard against duplicate shutdown and add TCP quit support ([6e01f00](https://github.com/forjd/browse/commit/6e01f00ff1f85055223a88cb93511ca813b0446c))
* harden assert-ai flag validation, JSON parsing, and fetch timeouts ([cef73a6](https://github.com/forjd/browse/commit/cef73a6cb6e033bcab52b7bff5b3dd9775c5ef7b))
* harden assert-ai screenshot I/O and page.title() error handling ([49c7d96](https://github.com/forjd/browse/commit/49c7d9645c834ba0c9cd968ef7a3bf63a81c577a))
* implement --json flag for snapshot, console, network, cookies, storage, and a11y commands ([7e18591](https://github.com/forjd/browse/commit/7e18591a6649356019d236fa645e54430c55d06f)), closes [#48](https://github.com/forjd/browse/issues/48)
* normalise form field keys and add placeholder fallback ([b6f6050](https://github.com/forjd/browse/commit/b6f6050345f0967f7f86d502868d85b4b2547bbf)), closes [#54](https://github.com/forjd/browse/issues/54)
* prevent CDP session leak when history check fails ([c9fa177](https://github.com/forjd/browse/commit/c9fa177e441f880246fef8383c7d90aac3f11367))
* properly shut down daemon on quit and clean up SingletonLock ([9f95054](https://github.com/forjd/browse/commit/9f95054fad2681afa2633cd455883bed233781a1)), closes [#51](https://github.com/forjd/browse/issues/51)
* register help command in COMMANDS map ([94c3f06](https://github.com/forjd/browse/commit/94c3f0608230daebc874add8a6a676795bd7da5e)), closes [#58](https://github.com/forjd/browse/issues/58)
* reject NaN confidence in assert-ai, reject unknown flags in form ([c922b50](https://github.com/forjd/browse/commit/c922b50d687ee867d868d453291539902ec5147d))
* report actual validation error instead of 'not found' for invalid config ([448c3e8](https://github.com/forjd/browse/commit/448c3e8a86904673f7b17d4187a5c065cde6bbba)), closes [#55](https://github.com/forjd/browse/issues/55)
* route explicit console: warning to consoleWarnings and render in JUnit ([4ac5a9c](https://github.com/forjd/browse/commit/4ac5a9c870f001b05a6a31de0a7845eea99d3f13))
* route idle-timer through shutdownOnce and harden concurrent quit test ([5f4902f](https://github.com/forjd/browse/commit/5f4902f3dfc3c6d4d3461f14465024927a7f5de5))
* run benchmark on temporary page to prevent history pollution ([35424dc](https://github.com/forjd/browse/commit/35424dcd37d0e50d1ac096bfcaf56504a8c80d73)), closes [#52](https://github.com/forjd/browse/issues/52)
* show '(none)' instead of empty string in available list ([e70eb08](https://github.com/forjd/browse/commit/e70eb0838e6b7b872d8bc788a9db4566478ab34a)), closes [#59](https://github.com/forjd/browse/issues/59)
* treat console errors as warnings unless explicitly configured ([310d555](https://github.com/forjd/browse/commit/310d555754d7452a9064d1e915c1a023f2f7c553)), closes [#53](https://github.com/forjd/browse/issues/53)
* use CDP full tree for snapshot -f to differentiate from -i ([781e06b](https://github.com/forjd/browse/commit/781e06b0ebc064ebf4a96cce407608d3f405693c)), closes [#60](https://github.com/forjd/browse/issues/60)
* use CDP history check for forward/back to ensure cross-platform reliability ([495e129](https://github.com/forjd/browse/commit/495e12950168c80f6fa9b5688ff07c1c60458455)), closes [#61](https://github.com/forjd/browse/issues/61)
* use node:zlib for PNG IDAT decompression to handle zlib-wrapped data ([46aa06d](https://github.com/forjd/browse/commit/46aa06dc9460d63aded1fa880a2beda7b998d86f)), closes [#49](https://github.com/forjd/browse/issues/49)

## [0.8.2](https://github.com/forjd/browse/compare/browse-v0.8.1...browse-v0.8.2) (2026-03-16)


### Bug Fixes

* quote SKILL.md description to produce valid YAML frontmatter ([73745b9](https://github.com/forjd/browse/commit/73745b931c991fbe4d669e6bd2aa1bed391ca3df))

## [0.8.1](https://github.com/forjd/browse/compare/browse-v0.8.0...browse-v0.8.1) (2026-03-16)


### Bug Fixes

* address code review findings across multiple modules ([69342da](https://github.com/forjd/browse/commit/69342da22b971a777436b0b65db47a226d80f80b))
* align BACKOFF_DELAYS array with documented exponential backoff ([7455214](https://github.com/forjd/browse/commit/7455214a082d4f812e73d3de3ce5e19bde678154))
* harden regex handling, report resilience, and HTML escaping ([804c5a7](https://github.com/forjd/browse/commit/804c5a76a24a0db2b8c3780842b07f88bb082b1d))
* resolve click timeout on combobox elements ([#33](https://github.com/forjd/browse/issues/33)) ([4a9d0e7](https://github.com/forjd/browse/commit/4a9d0e7d0b6e791c683d52447e92ec0786613faf))
* support custom ARIA comboboxes in select command ([#34](https://github.com/forjd/browse/issues/34)) ([e1d09b1](https://github.com/forjd/browse/commit/e1d09b1d4e969410dfbdfcff1592698f11baed0d))

## [0.8.0](https://github.com/forjd/browse/compare/browse-v0.7.1...browse-v0.8.0) (2026-03-16)


### Features

* add comprehensive feature gap analysis ([600d3d0](https://github.com/forjd/browse/commit/600d3d0732a91e55cb6079256af0ae39795f5037))
* implement all 6 tier-1 feature gaps ([668ffae](https://github.com/forjd/browse/commit/668ffae5d8852a0fcc055d9d7b5c0671853f2b68))


### Bug Fixes

* **ci:** install chrome (not chromium) and match setup.sh compile flags ([6beb97d](https://github.com/forjd/browse/commit/6beb97d7780b7a0fc69ea2b332d40179daeb9f8a))
* **ci:** split Playwright browser install by OS ([cbcbe0c](https://github.com/forjd/browse/commit/cbcbe0c6d799e7af962019c36a97ea50cc399567))
* harden auth, JUnit output, PNG validation, and docs accuracy ([b1d95ba](https://github.com/forjd/browse/commit/b1d95ba5e54fda6f1956f772e70627637adf2bd3))
* harden input validation, auth security, and docs accuracy ([96b03fc](https://github.com/forjd/browse/commit/96b03fcac7fb6259943ad5f28d37e753d5ca8341))

## [0.7.1](https://github.com/forjd/browse/compare/browse-v0.7.0...browse-v0.7.1) (2026-03-15)


### Bug Fixes

* add missing --json flag to help text for 6 commands ([ca5a5cc](https://github.com/forjd/browse/commit/ca5a5ccd53abc8844c625ec6f87acfab77739600))

## [0.7.0](https://github.com/forjd/browse/compare/browse-v0.6.0...browse-v0.7.0) (2026-03-15)


### Features

* add dialog, download, frame, intercept, cookies, storage, html, title, pdf, element-count commands ([fb67112](https://github.com/forjd/browse/commit/fb671125be1f479837ba4860d078307ff2e190c9))
* add isolated browser contexts and fix review findings ([5d70386](https://github.com/forjd/browse/commit/5d703861f6621c1ed28d31dda98ef4ec328edb6d))
* add named sessions, multi-context isolation, ping/status commands ([72b2eba](https://github.com/forjd/browse/commit/72b2eba1f33cda6681d8e43441ef48e6926c713e))
* add pool manager library and help text for all new commands ([a248e92](https://github.com/forjd/browse/commit/a248e9237a31769f97b6d2805ece3091bc4652f0))


### Bug Fixes

* per-session state isolation and pool robustness ([00fb5ad](https://github.com/forjd/browse/commit/00fb5ad40320ce5d3b6f9b148c2bb89334ce6f67))

## [0.6.0](https://github.com/forjd/browse/compare/browse-v0.5.0...browse-v0.6.0) (2026-03-13)


### Features

* add stealth mode to bypass Cloudflare Turnstile and bot detection ([8580256](https://github.com/forjd/browse/commit/8580256fa70cab5d10395dc45ba945a4b80e207b))

## [0.5.0](https://github.com/forjd/browse/compare/browse-v0.4.3...browse-v0.5.0) (2026-03-13)


### Features

* support element refs ([@e1](https://github.com/e1)) in assert and wait commands ([6bda17e](https://github.com/forjd/browse/commit/6bda17eae9374fe0a734be6c3e4f12a47004900a))

## [0.4.3](https://github.com/forjd/browse/compare/browse-v0.4.2...browse-v0.4.3) (2026-03-13)


### Bug Fixes

* read version from package.json instead of hardcoding ([e1ffe7a](https://github.com/forjd/browse/commit/e1ffe7aa1c11db4699089113df3cba407a3bfed6))

## [0.4.2](https://github.com/forjd/browse/compare/browse-v0.4.1...browse-v0.4.2) (2026-03-13)


### Bug Fixes

* patch playwright require.resolve for compiled binary compatibility ([935dc67](https://github.com/forjd/browse/commit/935dc67207228d3e2020827dccacff523b329269))

## [0.4.1](https://github.com/forjd/browse/compare/browse-v0.4.0...browse-v0.4.1) (2026-03-13)


### Bug Fixes

* externalize playwright from compiled binary ([d08fdb3](https://github.com/forjd/browse/commit/d08fdb3db931c66a47ffe98e3a15756e7896c465))

## [0.4.0](https://github.com/forjd/browse/compare/browse-v0.3.0...browse-v0.4.0) (2026-03-13)


### Features

* add `a11y` command for accessibility auditing ([4e5f8b6](https://github.com/forjd/browse/commit/4e5f8b6517254ab635d1e3b85db0a89f01ba5b0d)), closes [#14](https://github.com/forjd/browse/issues/14)
* add `attr` command to read element attributes ([cc94154](https://github.com/forjd/browse/commit/cc94154672fda8ced852b7daeee23225fc961f31))
* add `back`, `forward`, and `reload` commands ([d82b3df](https://github.com/forjd/browse/commit/d82b3df00ddee4ce5c42a7bb4e408878f0bd5f46)), closes [#11](https://github.com/forjd/browse/issues/11)
* add `hover` command for element hover interactions ([6753b1a](https://github.com/forjd/browse/commit/6753b1a08339b6dbb37c687be37dd948be835b5d))
* add `press` command for keyboard events ([d9beee7](https://github.com/forjd/browse/commit/d9beee7a7f1382a55c88806c207bcc337c83a99d)), closes [#8](https://github.com/forjd/browse/issues/8)
* add `upload` command for file inputs ([262cce1](https://github.com/forjd/browse/commit/262cce10b7a6b45be12d70f5dbc1bcd68c8ba936)), closes [#13](https://github.com/forjd/browse/issues/13)
* add `url` command to print current page URL ([8ddb99d](https://github.com/forjd/browse/commit/8ddb99df56888a6c792dfe20c35a923c7f659cf0))
* add `version` command to print version and platform info ([0b42749](https://github.com/forjd/browse/commit/0b427494c617920d248925abdaf3115355fd2890)), closes [#18](https://github.com/forjd/browse/issues/18)
* add `wait` command for condition-based waiting ([8fa8501](https://github.com/forjd/browse/commit/8fa8501c16d571abe1325cc6e01119db00f19b08)), closes [#9](https://github.com/forjd/browse/issues/9)

## [0.3.0](https://github.com/forjd/browse/compare/browse-v0.2.0...browse-v0.3.0) (2026-03-13)


### Features

* add `scroll` command for page scrolling and element visibility ([d565ade](https://github.com/forjd/browse/commit/d565ade0f828e3aec9604e2b7f180fd84e514b81))
* download precompiled binary in install script instead of building from source ([d605631](https://github.com/forjd/browse/commit/d605631f5f9810eb41c131ad9e4619d7df33525e))

## [0.2.0](https://github.com/forjd/browse/compare/browse-v0.1.0...browse-v0.2.0) (2026-03-13)


### Features

* add curl-pipe-bash install script ([8add6a7](https://github.com/forjd/browse/commit/8add6a7dd7a11e1d5c172012c26932e988432c5f))
* add eval and page-eval commands for arbitrary JS execution ([9b81cdf](https://github.com/forjd/browse/commit/9b81cdfa30a7051ca009b0525c446a6288f1b242)), closes [#3](https://github.com/forjd/browse/issues/3)
* add help command and --help flag ([22d2db5](https://github.com/forjd/browse/commit/22d2db5ec44cbcbb33e60f140e78d48c3e52e459))
* add stealth options to reduce bot detection ([fad0f96](https://github.com/forjd/browse/commit/fad0f96e1e6df816fbd8980ea390b033eae162ca))
* add viewport command for responsive testing ([7f8656d](https://github.com/forjd/browse/commit/7f8656da242523e17c42d1187d8a39ab15c36809)), closes [#2](https://github.com/forjd/browse/issues/2)
* add viewport flags to goto command ([a849a09](https://github.com/forjd/browse/commit/a849a098500a759141eb08d4e65f5fb4c49d9c15))
* implement Phase 0 — daemon + CLI foundation ([d19bef2](https://github.com/forjd/browse/commit/d19bef2631cdd5609f8981de3fac8ad8c13f403e))
* implement Phase 1 — snapshot and ref system ([1cb6ef6](https://github.com/forjd/browse/commit/1cb6ef690dc959574a613fdceb292cc5a0d7dacd))
* implement Phase 2 — screenshot, console, and network commands ([0979d31](https://github.com/forjd/browse/commit/0979d314e59ac7e4f63db7b17792cc59b6e38179))
* implement Phase 3 — auth, login, and multi-tab commands ([65338b5](https://github.com/forjd/browse/commit/65338b535be1d5b869a7b5436b7ad4bdb7371a16))
* implement Phase 4 — domain-specific commands ([9d962c1](https://github.com/forjd/browse/commit/9d962c1ffdcfa6bfce1fd4600dfdfd2521abc142))
* implement Phase 5 — skill file and integration ([97692f7](https://github.com/forjd/browse/commit/97692f75537e451b870312b1ca7a489b353a67f6))
* implement Phase 6 — hardening ([cff4f55](https://github.com/forjd/browse/commit/cff4f5531b038d042e86eaa71aea660c1ac873cc))
* use user-agents package for randomised UA strings ([875087f](https://github.com/forjd/browse/commit/875087f90e615df8a85d8c3530053e0ca3095ee1))


### Bug Fixes

* add &lt;title&gt; to smoke test data URL ([b8c010a](https://github.com/forjd/browse/commit/b8c010ac2ce6e95709902c4ec0187e814046efd9))
* add required YAML frontmatter to SKILL.md ([698d5d2](https://github.com/forjd/browse/commit/698d5d26bd381e5ece919c19707a5cbfe0fc06c2))
* bundle playwright JS into binary instead of marking external ([ca3ee68](https://github.com/forjd/browse/commit/ca3ee68e41fe19f22b2df21296bb3b2a4c877190))
* correct skills install command in README ([ed1a74a](https://github.com/forjd/browse/commit/ed1a74a6c4a1415f638ebe0eca2e6fdade788a9f))
* move ariaSnapshot mock to locator return in integration test ([1f8321e](https://github.com/forjd/browse/commit/1f8321e232d02a252f34fc516b0cffd3c502f783))
* move ariaSnapshot mock to locator return object ([e8a5092](https://github.com/forjd/browse/commit/e8a5092491e7ea3e9054c005e36cb9e5b21162d7))
* reject unrecognised flags instead of silently ignoring them ([d2626b4](https://github.com/forjd/browse/commit/d2626b41ab7d3756190fae006b355ed176fdee78))
* skip lefthook install when not in a git repo ([bd7e52e](https://github.com/forjd/browse/commit/bd7e52edfcf38fb99b01a338a01e444bbd749e25))


### Refactoring

* rename package and skill from bun-browser to browse ([df3a14f](https://github.com/forjd/browse/commit/df3a14f71604af55fd0a233473ed497fd0924fab))
