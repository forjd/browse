# Changelog

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
