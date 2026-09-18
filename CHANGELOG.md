# Changelog

## 0.1.0 (2026-09-18)


### Features

* **content:** add the profile resolver ([ad1c8c2](https://github.com/ricardov03/tilebox/commit/ad1c8c22164e17b015cf971f264582ef77e326f2))
* **deploy:** add wrangler pages deploy scripts ([af919aa](https://github.com/ricardov03/tilebox/commit/af919aaa27f818cad6f34c1c7b99f74be44ea561))
* **publish:** add the publish script ([c35dc48](https://github.com/ricardov03/tilebox/commit/c35dc488203442016ffcbdef19c4e66821140882))
* **publish:** wire npm run publish and the deploy aliases ([af52f39](https://github.com/ricardov03/tilebox/commit/af52f39516d2289ea857d58266659b9728c347a6))
* **release:** add local release script ([6052ff1](https://github.com/ricardov03/tilebox/commit/6052ff13e3b451dde45136f49a685d3acd52cb5f))
* **release:** refuse a release with tracked personal data ([b232e45](https://github.com/ricardov03/tilebox/commit/b232e450d5dde43fd978b4b806d85c4467546347))


### Bug fixes

* **blocks:** pass aria-hidden to the play icon as a boolean ([2a49058](https://github.com/ricardov03/tilebox/commit/2a4905860342dedd82fcd36c673f3e2e21c27ccc))
* **content:** anchor ROOT on the resolver file, not the cwd ([22d83b4](https://github.com/ricardov03/tilebox/commit/22d83b4e7e5905f3746119fd7b1bd61a0964f7ac))
* **content:** fail ensureProfile with a clear message ([a7aa98e](https://github.com/ricardov03/tilebox/commit/a7aa98e810190785ca64465b5c420d3efd0fbacf))
* **content:** find the repo root upward, not from the bundle path ([5496448](https://github.com/ricardov03/tilebox/commit/5496448e66bb6416db68ad59a1318e676b5bed8a))
* **content:** keep the cause on the ensureProfile copy error ([53c8526](https://github.com/ricardov03/tilebox/commit/53c85263a2794909b9ecd1d579c3000b9e09f284))
* **content:** resolve the profile path lazily, not at import ([5dc975b](https://github.com/ricardov03/tilebox/commit/5dc975b65ecabf43af25aeac8069c7d4f6ffff53))
* **publish:** accept only https for --site-url ([249aa42](https://github.com/ricardov03/tilebox/commit/249aa42bb3b565c0e188b13bc6005be4c8346c4c))
* **publish:** confirm before a publish of the sample profile ([b917115](https://github.com/ricardov03/tilebox/commit/b917115b626e502c0473a33e06ae19b7803eb5ec))
* **publish:** fail with exit 2 when --yes needs an answer ([868c698](https://github.com/ricardov03/tilebox/commit/868c698294ab31cbf9d72f6b88595bb68faea184))
* **publish:** set process.exitCode and let the process end ([3831d13](https://github.com/ricardov03/tilebox/commit/3831d13217b7ae3d7b27859f6b3426e82cf4795f))
* **publish:** validate accountId in the saved state ([f5bd5e6](https://github.com/ricardov03/tilebox/commit/f5bd5e6a9e28cc5be222dbc448ea9871d67e0709))
* **release:** check the tag early and show recovery when tagging fails ([3a46be5](https://github.com/ricardov03/tilebox/commit/3a46be54f7e7a45f05aed1f3fa04a74e1e82bfdb))
* **release:** derive the repository URL from the git remote ([e1ff536](https://github.com/ricardov03/tilebox/commit/e1ff536d598824d75f12b6bfd1a793c4e6364e49))
* **release:** escape regex metacharacters in the version heading regex ([84a6c42](https://github.com/ricardov03/tilebox/commit/84a6c4244943184cf81cb646c405fd34701dbb68))
* **release:** install chromium before the Playwright static run ([07689c2](https://github.com/ricardov03/tilebox/commit/07689c2e06b8114ead5d7b097d067a0ca9430f95))
* **release:** keep stdout and stderr separate in run() ([c3249d7](https://github.com/ricardov03/tilebox/commit/c3249d76368902d75950a23d38cb58e31074486b))
* **release:** refuse a release with no commits since the last tag ([6f95026](https://github.com/ricardov03/tilebox/commit/6f9502688c1ac47cd225476f067696daab12e644))
* **release:** run npm and npx through the shell on Windows ([650f6ca](https://github.com/ricardov03/tilebox/commit/650f6cafac191b759d14c7aee5669ff997d3cf9a))
* **release:** show the fallback prompt after a failed draft with --yes ([6fe81f6](https://github.com/ricardov03/tilebox/commit/6fe81f6a24c6e8564ed908812c3275f7a64f8dcd))
* **release:** skip the summary prompt when there is no terminal ([1acf799](https://github.com/ricardov03/tilebox/commit/1acf79932c09493ffec324c323def3ef04169f7e))
* **server:** ask for a restart after the first personal save ([92774db](https://github.com/ricardov03/tilebox/commit/92774dbd893f4a1afd65f00b592fb6d7df0ee5b5))


### Refactoring

* **config:** read the profile and manifests through aliases ([d7fb3de](https://github.com/ricardov03/tilebox/commit/d7fb3de961a0fcb2f547355b2e886e93ac8cbd46))
* **scripts:** use the profile resolver and add ensure:profile ([6cb32fc](https://github.com/ricardov03/tilebox/commit/6cb32fcd74c58e68b17b185cb95cf034b36ad81a))
* **server:** write content/profile.json, read the resolved file ([3a3b278](https://github.com/ricardov03/tilebox/commit/3a3b278cd33458b3f7aedb58c63684ad39d875c1))
* **test:** read the profile through the resolver ([0f03ab1](https://github.com/ricardov03/tilebox/commit/0f03ab1db88c016efcd9d31b1a46c5c4321d94f1))
