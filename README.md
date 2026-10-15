# uniform

I wanted my code to read like a person wrote it, and still be as tight as anything a tool would produce.
uniform is that house style, written down ([STYLE.md](STYLE.md)) and enforced. It reports one of two things:
**lit** (the repo follows the style) or **dark** (it doesn't, here's where).

It comes in three pieces:

- **a shared config**: ESLint (typescript-eslint, flat config) + Prettier, plus a `uniform` CLI
- **a GitHub Action**: `uses: fitzyracing1/uniform@v1`
- **a small service**: `GET /check/:owner/:repo` for any public GitHub repo, plus a badge

## Use the config

It isn't on npm yet, so install it from GitHub:

```sh
npm i -D eslint prettier github:fitzyracing1/uniform#v1
```

```js
// eslint.config.mjs
export { default } from '@fitzyracing1/uniform/eslint';
```

```json
// package.json
"prettier": "@fitzyracing1/uniform/prettier",
"scripts": { "lint": "eslint .", "format:check": "prettier --check ." }
```

Or skip the wiring and run `npx uniform check` (add `--fix` to fix what can be fixed, `--json` for machines).
Paths in `.uniformignore` (gitignore style) are skipped by both tools.

## Use the Action

```yaml
jobs:
  uniform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: fitzyracing1/uniform@v1
        # with:
        #   path: packages/app
```

The job is lit when the repo follows the style and dark otherwise. Findings go to the job summary, and the
`status` output is `lit` or `dark`.

## Run the service

```sh
npm ci
npm start                     # PORT=3000 by default
curl localhost:3000/check/fitzyracing1/fakegreen-handwritten
curl "localhost:3000/check/fitzyracing1/fakegreen-handwritten?ref=style/uniform"
curl localhost:3000/badge/fitzyracing1/fakegreen-handwritten.svg
```

`/check` returns `{ repo, ref, checkedAt, status: "lit" | "dark", findings: [...] }`. It downloads the repo's
tarball from GitHub, checks it, and deletes it. It never loads the repo's own ESLint or Prettier config, so
nothing from the checked repo runs. Results are cached for `CACHE_SECONDS` (600), and tarballs over
`MAX_TARBALL_MB` (50) are refused.

Badge for a README:

```md
![uniform](https://YOUR-HOST/badge/OWNER/REPO.svg)
```

### Deploying

It's a plain Node server with a Dockerfile, so anywhere that runs containers works.

- **Railway**: `railway init`, then `railway up` (or connect the GitHub repo in the dashboard). `railway.json` picks
  the Dockerfile and uses `/healthz` as the health check. Railway sets `PORT` itself.
- **Docker anywhere**: `docker build -t uniform . && docker run -p 3000:3000 uniform`

## License

MIT. Copyright (c) 2026 Joshua Almeida.
