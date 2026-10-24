import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGES, BASE_URL, read, rootPrefix, between, attrs, metaContent, resolveLocal, fileExists, textOf,
} from './site-helpers.mjs';

const exists = PAGES.filter((p) => fileExists(p));

test('every page exists', () => {
  assert.deepEqual(exists, PAGES);
});

for (const page of PAGES) {
  test(`${page}: head basics`, () => {
    const html = read(page);
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /<html lang="en">/);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, 'exactly one h1');
    assert.match(html, /<title>[^<]*APIPulse[^<]*<\/title>/);
    assert.ok(metaContent(html, 'name', 'description'), 'meta description');
    assert.ok(metaContent(html, 'name', 'viewport'), 'viewport');
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
    if (page === '404.html') assert.equal(canonical, undefined);
    else assert.equal(canonical, BASE_URL + page.replace(/index\.html$/, ''));
  });

  test(`${page}: content security policy`, () => {
    const html = read(page);
    const csp = metaContent(html, 'http-equiv', 'Content-Security-Policy');
    assert.ok(csp, 'CSP meta present');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /connect-src 'none'/);
    assert.match(csp, /base-uri 'none'/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
    if (page === 'teams/index.html') assert.match(csp, /form-action https:\/\/formspree\.io mailto:/);
    else assert.match(csp, /form-action 'none'/);
  });

  test(`${page}: no inline scripts or styles`, () => {
    const html = read(page);
    for (const tag of html.match(/<script\b[^>]*>/g) || []) assert.match(tag, /\ssrc="/, tag);
    assert.doesNotMatch(html, /<style[\s>]/);
    assert.doesNotMatch(html, /\sstyle="/);
    assert.doesNotMatch(html, /\son[a-z]+="/, 'no inline event handlers');
  });

  test(`${page}: internal links resolve`, () => {
    const html = read(page);
    for (const ref of [...attrs(html, 'href'), ...attrs(html, 'src')]) {
      const target = resolveLocal(page, ref);
      if (target === null) continue;
      assert.ok(fileExists(target), `${page} -> ${ref} (${target})`);
    }
  });

  test(`${page}: copy rules`, () => {
    const main = between(read(page), '<main', '</main>');
    assert.ok(main, 'has <main>');
    const text = textOf(main);
    for (const word of ['cuddlynest', 'unlock', 'seamless', 'supercharge']) {
      assert.ok(!text.toLowerCase().includes(word), `${page} contains "${word}"`);
    }
    assert.ok(!text.includes('APIpulse'), `${page} uses the old spelling APIpulse`);
    assert.ok(!text.includes('!'), `${page} uses an exclamation mark`);
  });
}

test('header and footer are identical across pages', () => {
  const norm = (page, block) => block.split(`"${rootPrefix(page)}`).join('"ROOT/');
  const strip = (s) => s.replace(/ aria-current="page"/g, '');
  const first = PAGES[0];
  const h0 = strip(norm(first, between(read(first), '<header class="site-header"', '</header>')));
  const f0 = norm(first, between(read(first), '<footer class="site-footer"', '</footer>'));
  for (const page of PAGES.slice(1)) {
    const html = read(page);
    assert.equal(strip(norm(page, between(html, '<header class="site-header"', '</header>'))), h0, `${page} header`);
    assert.equal(norm(page, between(html, '<footer class="site-footer"', '</footer>')), f0, `${page} footer`);
  }
});

test('footer carries the non-affiliation note', () => {
  assert.match(read('index.html'), /Not affiliated with any supplier named on this site\./);
});

test('.nojekyll exists so Pages serves files as-is', () => {
  assert.ok(fileExists('.nojekyll'));
});

test('sitemap lists every public page', () => {
  const xml = read('sitemap.xml');
  for (const page of PAGES.filter((p) => p !== '404.html')) {
    assert.ok(xml.includes(`<loc>${BASE_URL}${page.replace(/index\.html$/, '')}</loc>`), page);
  }
});

for (const page of PAGES.filter((p) => p !== '404.html')) {
  test(`${page}: social tags`, () => {
    const html = read(page);
    assert.equal(metaContent(html, 'property', 'og:image'), `${BASE_URL}assets/img/social-card.png`);
    assert.equal(metaContent(html, 'property', 'og:url'), BASE_URL + page.replace(/index\.html$/, ''));
    assert.ok(metaContent(html, 'property', 'og:title'));
    assert.equal(metaContent(html, 'name', 'twitter:card'), 'summary_large_image');
    assert.ok(fileExists('assets/img/social-card.png'));
  });
}
