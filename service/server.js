// uniform as a service: GET /check/:owner/:repo and /badge/:owner/:repo for any public GitHub repo.
// Safe to point at strangers' code: we never load their ESLint or Prettier config (ours is forced),
// so nothing from the repo gets executed. We only read files.
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { check } = require('../lib/check');
const { learn } = require('../lib/style-md');

const PORT = Number(process.env.PORT ?? 3000);
const CACHE_MS = Number(process.env.CACHE_SECONDS ?? 600) * 1000;
const MAX_BYTES = Number(process.env.MAX_TARBALL_MB ?? 50) * 1024 * 1024;
const NAME = /^[A-Za-z0-9_.-]{1,100}$/;
const REF = /^[A-Za-z0-9_./-]{1,200}$/;

const cache = new Map();

async function download(owner, repo, ref, dir) {
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) throw httpError(404, `${owner}/${repo}@${ref} not found (or not public)`);
  if (!res.ok) throw httpError(502, `GitHub answered ${res.status}`);
  const tar = spawn('tar', ['-xzf', '-', '-C', dir, '--strip-components=1', '--no-same-owner']);
  const done = new Promise((resolve, reject) => {
    tar.on('error', reject);
    tar.on('close', (code) =>
      code === 0 ? resolve() : reject(httpError(502, `could not unpack the tarball (tar ${code})`)),
    );
  });
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_BYTES) {
      tar.kill();
      throw httpError(413, `repo tarball is over ${MAX_BYTES / 1024 / 1024} MB`);
    }
    if (!tar.stdin.write(chunk)) await new Promise((r) => tar.stdin.once('drain', r));
  }
  tar.stdin.end();
  await done;
}

// Download, run, delete. The tarball only ever lives in a temp dir for the length of one request.
async function withRepo(owner, repo, ref, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uniform-'));
  try {
    await download(owner, repo, ref, dir);
    return await run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

async function runCheck(owner, repo, ref) {
  const key = `${owner}/${repo}@${ref}`.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = withRepo(owner, repo, ref, async (dir) => ({
    repo: `${owner}/${repo}`,
    ref,
    checkedAt: new Date().toISOString(),
    ...(await check(dir)),
  }));
  cache.set(key, { at: Date.now(), promise });
  // failures shouldn't stick around for ten minutes
  promise.catch(() => cache.delete(key));
  return promise;
}

// Stateless on purpose: no cache, nothing kept. The profile is numbers about the code, not the code.
function runLearn(owner, repo, ref) {
  return withRepo(owner, repo, ref, (dir) => {
    const { profile, style } = learn(dir, { write: false });
    return { repo: `${owner}/${repo}`, ref, learnedAt: new Date().toISOString(), profile, style };
  });
}

function badge(status) {
  const color = status === 'lit' ? '#2ea44f' : status === 'dark' ? '#24292f' : '#9f9f9f';
  const left = 'uniform';
  const right = status;
  const lw = 58;
  const rw = right.length * 7 + 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${left}: ${right}">
<title>${left}: ${right}</title>
<rect width="${lw}" height="20" fill="#555"/><rect x="${lw}" width="${rw}" height="20" fill="${color}"/>
<g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
<text x="${lw / 2}" y="14">${left}</text><text x="${lw + rw / 2}" y="14">${right}</text></g></svg>
`;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, { 'content-type': type, 'access-control-allow-origin': '*', ...extra });
  res.end(body);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  const learning = parts[0] === 'learn';
  if (req.method !== 'GET' && !(learning && req.method === 'POST'))
    return send(res, 405, 'text/plain', 'GET only (POST also works for /learn)\n');
  if (parts.length === 0) {
    return send(
      res,
      200,
      'text/plain',
      'uniform\n\nGET /check/:owner/:repo[?ref=main]   lit/dark + findings as JSON\nGET /badge/:owner/:repo[?ref=main]   SVG badge\nGET|POST /learn/:owner/:repo[?ref=main]   learned style profile + STYLE.md (nothing stored)\nGET /healthz\n',
    );
  }
  if (parts[0] === 'healthz') return send(res, 200, 'text/plain', 'ok\n');
  const [route, owner, rawRepo] = parts;
  if (!['check', 'badge', 'learn'].includes(route) || parts.length !== 3)
    return send(res, 404, 'text/plain', 'not found\n');
  const repo = rawRepo.replace(/\.(svg|json)$/, '');
  const ref = url.searchParams.get('ref') ?? 'HEAD';
  if (!NAME.test(owner) || !NAME.test(repo) || !REF.test(ref) || ref.includes('..')) {
    return send(res, 400, 'application/json', JSON.stringify({ error: 'bad owner, repo or ref' }) + '\n');
  }
  try {
    if (learning)
      return send(res, 200, 'application/json', JSON.stringify(await runLearn(owner, repo, ref), null, 2) + '\n');
    const result = await runCheck(owner, repo, ref);
    if (route === 'badge')
      return send(res, 200, 'image/svg+xml', badge(result.status), { 'cache-control': 'max-age=300' });
    return send(res, 200, 'application/json', JSON.stringify(result, null, 2) + '\n');
  } catch (e) {
    const status = e.status ?? 500;
    if (route === 'badge') return send(res, 200, 'image/svg+xml', badge('error'), { 'cache-control': 'no-cache' });
    return send(res, status, 'application/json', JSON.stringify({ error: e.message }) + '\n');
  }
}

if (require.main === module) {
  http
    .createServer((req, res) => handle(req, res).catch((e) => send(res, 500, 'text/plain', String(e.message))))
    .listen(PORT, () => process.stdout.write(`uniform service on :${PORT}\n`));
}

module.exports = { handle, badge };
