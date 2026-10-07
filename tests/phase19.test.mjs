// Phase 19 -- Batch 4 §18: Android back navigation.
//
// Until this batch nothing in the app listened for the Android Back button;
// @capacitor/app was not even a dependency. Back fell through to the
// WebView's raw history, which is wrong in ways that are invisible in a
// desktop browser and jarring on a phone:
//
//   * a deep-linked inner screen has a history length of 1, so Back EXITED
//     the app from the middle of a job
//   * a full-screen overlay (photo markup) is not a history entry, so Back
//     navigated the screen out from under it and orphaned the overlay
//   * history.length counts entries from before the app booted, so "can I
//     go back?" could not be answered from it
//
// decideBack() is a pure function precisely so all of that can be pinned
// down here with no device, no WebView and no Capacitor. The browser half of
// this file covers the two bindings that are not pure: the overlay stack as
// photo-markup.js actually uses it, and the filter-URL behaviour that must
// NOT create history entries.

import assert from 'node:assert/strict';
import pkg from '/opt/node-tools/node_modules/playwright/index.js';
import { createRecorder, BASE, FAKE_CAPACITOR_CORE } from './test-harness.mjs';
import {
  decideBack, parentOf, isRoot, fieldParentOf, ROOT_PATH, FIELD_ROOT_PATH,
  pushOverlay, removeOverlay, overlayCount, dismissTopOverlay,
  isTextInputFocused, isKeyboardLikelyOpen, installBackHandler,
  BACK_CLOSE_OVERLAY, BACK_CLOSE_DRAWER, BACK_DISMISS_KEYBOARD,
  BACK_HISTORY, BACK_GO_PARENT, BACK_EXIT
} from '../admin/js/lib/navigation.js';

const { chromium } = pkg;
const { results, record } = createRecorder();

const FAKE_SUPABASE_ADMIN = `
  export const supabase = { auth: { signOut: async () => {} } };
  export async function getSession() { return { session: { user: { id: 'admin-1' } }, isAdmin: true }; }
`;

const SUMMARY = {
  requests_new: 1, requests_reviewed_unconverted: 0, jobs_awaiting_customer: 0,
  jobs_accepted_unscheduled: 0, scheduled_today: 0, scheduled_next_7_days: 0,
  overdue_scheduled: 0, completed_last_14_days: 0, jobs_with_review_flags: 0,
  recent_activity: [], generated_at: '2026-10-07T12:00:00Z'
};

const SPA_API = `
  globalThis.__calls = { searchJobs: [] };
  export async function dashboardSummary() { return ${JSON.stringify(SUMMARY)}; }
  export async function searchJobs(args) {
    globalThis.__calls.searchJobs.push(args);
    return { total: 0, limit: 50, offset: 0, sort: args?.sort || 'updated_desc', rows: [] };
  }
  export async function listRequests() { return []; }
  export async function getSettings() { return {}; }
`;

async function openAdmin(browser, { hash = '/dashboard', width = 1200 } = {}) {
  const page = await browser.newPage();
  const mock = (urlPattern, body) =>
    page.route(urlPattern, (route) =>
      route.fulfill({ status: 200, contentType: 'application/javascript', body }));
  await mock('**/cdn.jsdelivr.net/npm/@capacitor/core@8.5.2/+esm', FAKE_CAPACITOR_CORE);
  await mock(`${BASE}/shared/supabase.js`, FAKE_SUPABASE_ADMIN);
  await mock(`${BASE}/admin/js/lib/api.js`, SPA_API);
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`${BASE}/admin/index.html#${hash}`);
  await page.waitForTimeout(300);
  return page;
}

async function main() {
  /* ======================================================== route graph == */

  await record('1. Every inner admin screen has a parent; only the dashboard is root', async () => {
    assert.equal(parentOf('/dashboard'), null, 'the dashboard is the root');
    assert.equal(isRoot('/dashboard'), true);

    assert.equal(parentOf('/jobs'), ROOT_PATH);
    assert.equal(parentOf('/requests'), ROOT_PATH);
    assert.equal(parentOf('/customers'), ROOT_PATH);
    assert.equal(parentOf('/winter'), ROOT_PATH);
    assert.equal(parentOf('/settings'), ROOT_PATH);

    // Detail routes go up to their list, not to the root.
    assert.equal(parentOf('/jobs/abc-123'), '/jobs');
    assert.equal(parentOf('/customers/abc-123'), '/customers');
    assert.equal(parentOf('/properties/abc-123'), '/customers');

    for (const p of ['/jobs', '/jobs/x', '/customers', '/customers/x', '/properties/x']) {
      assert.equal(isRoot(p), false, `${p} must not be treated as the root`);
    }
  });

  await record('2. A query string never changes which screen a path is', async () => {
    assert.equal(parentOf('/jobs?bucket=today'), ROOT_PATH);
    assert.equal(parentOf('/jobs/abc?tab=photos'), '/jobs');
    assert.equal(parentOf('/dashboard?x=1'), null, 'the root stays the root with a query');
  });

  await record('3. An unknown route falls back to the root rather than nowhere', async () => {
    // A typo or a future route must never leave Back with no target, which
    // is what would exit the app from an inner screen.
    assert.equal(parentOf('/nonsense'), ROOT_PATH);
    assert.equal(parentOf(''), null, 'empty path is treated as the root');
    assert.equal(parentOf(undefined), null);
  });

  await record('4. A contextual parent overrides the static map but cannot invent one', async () => {
    // A property opened from a customer goes back to THAT customer.
    assert.equal(
      parentOf('/properties/p1', { contextParent: '/customers/c1' }),
      '/customers/c1'
    );
    // It must not be able to give the root a parent, or the app could never exit.
    assert.equal(parentOf('/dashboard', { contextParent: '/customers/c1' }), null);
    // Nor point a screen at itself, which would be an infinite Back loop.
    assert.equal(parentOf('/customers/c1', { contextParent: '/customers/c1' }), '/customers');
  });

  await record('5. The field console has its own root and parent graph', async () => {
    assert.equal(fieldParentOf('/'), null, 'the schedule is the field root');
    assert.equal(fieldParentOf('/visit/abc-123'), FIELD_ROOT_PATH);
    assert.equal(fieldParentOf(''), null);
    // The field console must NOT inherit the desktop console's root, or
    // Back from a visit would navigate to a screen that does not exist here.
    assert.notEqual(FIELD_ROOT_PATH, ROOT_PATH);
  });

  /* ==================================================== back precedence == */

  await record('6. An open overlay wins over everything else', async () => {
    const d = decideBack({
      path: '/jobs/abc', hasOverlay: true, isDrawerOpen: true,
      isKeyboardOpen: true, canGoBack: true
    });
    assert.equal(d.action, BACK_CLOSE_OVERLAY,
      'the overlay must close before anything navigates or exits');
  });

  await record('7. The nav drawer closes before the screen changes', async () => {
    const d = decideBack({ path: '/jobs', isDrawerOpen: true, canGoBack: true });
    assert.equal(d.action, BACK_CLOSE_DRAWER);
  });

  await record('8. The keyboard is dismissed before the screen changes', async () => {
    const d = decideBack({ path: '/jobs/abc', isKeyboardOpen: true, canGoBack: true });
    assert.equal(d.action, BACK_DISMISS_KEYBOARD);
  });

  await record('9. With app history, Back pops one entry', async () => {
    const d = decideBack({ path: '/jobs/abc', canGoBack: true });
    assert.equal(d.action, BACK_HISTORY);
    assert.equal(d.target, undefined, 'history-back needs no target');
  });

  await record('10. A deep-linked inner screen goes to its parent, NEVER exits', async () => {
    // The headline bug: opened straight at a job from a notification, so
    // there is no history to pop.
    const job = decideBack({ path: '/jobs/abc', canGoBack: false });
    assert.equal(job.action, BACK_GO_PARENT);
    assert.equal(job.target, '/jobs');

    const prop = decideBack({ path: '/properties/p1', canGoBack: false });
    assert.equal(prop.action, BACK_GO_PARENT);
    assert.equal(prop.target, '/customers');

    // And with a contextual parent it goes somewhere even better.
    const inCtx = decideBack({
      path: '/properties/p1', canGoBack: false, contextParent: '/customers/c1'
    });
    assert.equal(inCtx.target, '/customers/c1');

    for (const p of ['/jobs/abc', '/properties/p1', '/customers/c1', '/jobs', '/settings']) {
      assert.notEqual(decideBack({ path: p, canGoBack: false }).action, BACK_EXIT,
        `${p} is an inner screen and must not exit the app`);
    }
  });

  await record('11. Only the root screen exits the app', async () => {
    assert.equal(decideBack({ path: '/dashboard', canGoBack: false }).action, BACK_EXIT);
    // Even at the root, real app history is popped first -- the user walked
    // dashboard -> jobs -> dashboard and expects to go back, not to quit.
    assert.equal(decideBack({ path: '/dashboard', canGoBack: true }).action, BACK_HISTORY);
  });

  await record('12. The field console exits only from its schedule screen', async () => {
    const atRoot = decideBack({
      path: '/', canGoBack: false, resolveParent: fieldParentOf
    });
    assert.equal(atRoot.action, BACK_EXIT);

    const inVisit = decideBack({
      path: '/visit/abc', canGoBack: false, resolveParent: fieldParentOf
    });
    assert.equal(inVisit.action, BACK_GO_PARENT);
    assert.equal(inVisit.target, '/');
  });

  /* ====================================================== overlay stack == */

  await record('13. Overlays dismiss newest-first and deregister cleanly', async () => {
    assert.equal(overlayCount(), 0, 'stack must start clean');
    const order = [];
    const closeA = pushOverlay(() => order.push('a'));
    pushOverlay(() => order.push('b'));
    assert.equal(overlayCount(), 2);

    assert.equal(dismissTopOverlay(), true);
    assert.deepEqual(order, ['b'], 'newest overlay closes first');
    assert.equal(overlayCount(), 1);

    // The remover returned by pushOverlay takes a layer out without firing it.
    closeA();
    assert.equal(overlayCount(), 0);
    assert.deepEqual(order, ['b'], 'removing must not invoke the dismiss');

    assert.equal(dismissTopOverlay(), false, 'an empty stack reports nothing to close');
  });

  await record('14. A dismiss that deregisters itself does not take the layer below with it', async () => {
    // Exactly what photo-markup.js does: its finish() calls removeOverlay.
    const order = [];
    pushOverlay(() => order.push('under'));
    const self = () => { removeOverlay(self); order.push('self'); };
    pushOverlay(self);

    dismissTopOverlay();
    assert.deepEqual(order, ['self']);
    assert.equal(overlayCount(), 1, 'the layer underneath must survive');

    dismissTopOverlay();
    assert.deepEqual(order, ['self', 'under']);
    assert.equal(overlayCount(), 0);
  });

  await record('15. pushOverlay refuses a non-function', async () => {
    assert.throws(() => pushOverlay(null), TypeError);
    assert.throws(() => pushOverlay('nope'), TypeError);
    assert.equal(overlayCount(), 0, 'a rejected push must not grow the stack');
  });

  /* =================================================== keyboard probing == */

  await record('16. Keyboard detection needs BOTH a focused field and a shrunken viewport', async () => {
    const fakeDoc = (active) => ({ activeElement: active });
    const input = { tagName: 'INPUT', getAttribute: () => 'text', isContentEditable: false };
    const button = { tagName: 'BUTTON', getAttribute: () => null, isContentEditable: false };

    assert.equal(isTextInputFocused(fakeDoc(input)), true);
    assert.equal(isTextInputFocused(fakeDoc(button)), false);
    assert.equal(isTextInputFocused(fakeDoc(null)), false);
    assert.equal(isTextInputFocused(fakeDoc({ tagName: 'TEXTAREA' })), true);
    assert.equal(
      isTextInputFocused(fakeDoc({ tagName: 'DIV', isContentEditable: true })), true);
    // A checkbox raises no keyboard.
    assert.equal(isTextInputFocused(
      fakeDoc({ tagName: 'INPUT', getAttribute: () => 'checkbox' })), false);

    // Focused field, full-height viewport -> keyboard is DOWN. Swallowing
    // Back here is the bug this guard exists to prevent.
    assert.equal(isKeyboardLikelyOpen({
      document: fakeDoc(input), innerHeight: 800, visualViewport: { height: 800 }
    }), false, 'a focused field alone must not count as an open keyboard');

    // Focused field, viewport collapsed to 55% -> keyboard is UP.
    assert.equal(isKeyboardLikelyOpen({
      document: fakeDoc(input), innerHeight: 800, visualViewport: { height: 440 }
    }), true);

    // Shrunken viewport with nothing focused is not a keyboard.
    assert.equal(isKeyboardLikelyOpen({
      document: fakeDoc(button), innerHeight: 800, visualViewport: { height: 440 }
    }), false);

    // No visualViewport support at all -> never guess.
    assert.equal(isKeyboardLikelyOpen({
      document: fakeDoc(input), innerHeight: 800
    }), false);
  });

  /* ======================================================= the binding == */

  await record('17. installBackHandler is a no-op off-native and never touches the plugin', async () => {
    let loaded = false;
    const handle = await installBackHandler({
      currentPath: () => '/dashboard',
      navigate: () => {},
      loadApp: async () => { loaded = true; return { App: {} }; },
      native: () => false
    });
    assert.equal(handle, null, 'off-native must return no handle');
    assert.equal(loaded, false, 'the plugin must not even be fetched in a browser tab');
  });

  await record('18. A missing plugin degrades silently instead of breaking startup', async () => {
    const handle = await installBackHandler({
      currentPath: () => '/dashboard',
      navigate: () => {},
      loadApp: async () => { throw new Error('offline CDN'); },
      native: () => true
    });
    assert.equal(handle, null, 'a failed plugin load must not throw out to the caller');
  });

  await record('19. The native handler performs each decision against a plugin double', async () => {
    const calls = [];
    let path = '/jobs/abc';
    let depth = 2;
    let drawer = false;

    const App = {
      exitApp: () => calls.push('exit'),
      addListener: async (name, fn) => { calls.push(`listen:${name}`); return { remove: () => {}, fn }; }
    };

    const handle = await installBackHandler({
      currentPath: () => path,
      navigate: (p) => calls.push(`navigate:${p}`),
      canGoBack: () => depth > 1,
      historyBack: () => calls.push('history-back'),
      isDrawerOpen: () => drawer,
      closeDrawer: () => { drawer = false; calls.push('close-drawer'); },
      keyboardOpen: () => false,
      loadApp: async () => ({ App }),
      native: () => true
    });

    assert.ok(handle, 'a native install must return a handle');
    assert.ok(calls.includes('listen:backButton'), 'must subscribe to backButton');

    // With history -> pop one entry.
    handle.handler();
    assert.ok(calls.includes('history-back'));

    // Drawer open -> close it, do not navigate.
    drawer = true;
    const before = calls.length;
    handle.handler();
    assert.deepEqual(calls.slice(before), ['close-drawer']);

    // Deep-linked inner screen -> go to the parent, not exit.
    depth = 1;
    const beforeParent = calls.length;
    handle.handler();
    assert.deepEqual(calls.slice(beforeParent), ['navigate:/jobs']);

    // Root with no history -> exit.
    path = '/dashboard';
    const beforeExit = calls.length;
    handle.handler();
    assert.deepEqual(calls.slice(beforeExit), ['exit']);

    // An overlay outranks all of it, even at the root with no history.
    let closed = false;
    pushOverlay(() => { closed = true; });
    const beforeOverlay = calls.length;
    handle.handler();
    assert.equal(closed, true, 'overlay must close');
    assert.deepEqual(calls.slice(beforeOverlay), [], 'and nothing must navigate or exit');
    assert.equal(overlayCount(), 0);
  });

  /* ============================================================ browser == */

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

  await record('20. Each new route gets a history depth stamp; filters do not', async () => {
    const page = await openAdmin(browser, { hash: '/jobs' });

    const initial = await page.evaluate(() => ({
      depth: window.history.state?.nsDepth,
      length: window.history.length
    }));
    assert.equal(initial.depth, 1, 'the first screen is depth 1');

    // Changing a filter must rewrite the URL in place: same history length,
    // same depth, new query string.
    const afterFilter = await page.evaluate(async () => {
      const before = window.history.length;
      const sel = [...document.querySelectorAll('select')]
        .find(s => [...s.options].some(o => o.value === 'overdue'));
      sel.value = 'overdue';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise(r => setTimeout(r, 250));
      return {
        lengthBefore: before,
        lengthAfter: window.history.length,
        depth: window.history.state?.nsDepth,
        hash: window.location.hash
      };
    });
    assert.equal(afterFilter.lengthAfter, afterFilter.lengthBefore,
      'a filter change must NOT add a history entry');
    assert.equal(afterFilter.depth, 1, 'and must not change the depth');
    assert.match(afterFilter.hash, /bucket=overdue/,
      'but the URL must still reflect the filter so a reload keeps it');
    await page.close();
  });

  await record('21. Navigating to a real screen does increase the depth', async () => {
    const page = await openAdmin(browser, { hash: '/dashboard' });
    const seen = await page.evaluate(async () => {
      const first = window.history.state?.nsDepth;
      window.location.hash = '/jobs';
      await new Promise(r => setTimeout(r, 300));
      const second = window.history.state?.nsDepth;
      return { first, second };
    });
    assert.equal(seen.first, 1);
    assert.equal(seen.second, 2, 'a screen change is a history entry worth popping');
    await page.close();
  });

  await record('22. Going back restores the earlier depth rather than inventing a new one', async () => {
    const page = await openAdmin(browser, { hash: '/dashboard' });
    const seen = await page.evaluate(async () => {
      window.location.hash = '/jobs';
      await new Promise(r => setTimeout(r, 300));
      const atJobs = window.history.state?.nsDepth;
      window.history.back();
      await new Promise(r => setTimeout(r, 300));
      return { atJobs, afterBack: window.history.state?.nsDepth, hash: window.location.hash };
    });
    assert.equal(seen.atJobs, 2);
    assert.equal(seen.afterBack, 1,
      'returning to an entry must adopt its stamp, not count a new one');
    assert.match(seen.hash, /#\/dashboard/);
    await page.close();
  });

  await record('23. A deep-linked filtered URL still starts at depth 1', async () => {
    // The case that used to exit the app: land straight on an inner screen.
    const page = await openAdmin(browser, { hash: '/jobs?bucket=overdue&needs_review=1' });
    const seen = await page.evaluate(() => ({
      depth: window.history.state?.nsDepth,
      firstCall: globalThis.__calls.searchJobs[0],
      calls: globalThis.__calls.searchJobs.length
    }));
    assert.equal(seen.depth, 1, 'no app history, so Back must use the parent route');
    assert.equal(seen.calls, 1, 'and the deep link must not load twice');
    assert.equal(seen.firstCall.scheduleBucket, 'overdue');
    assert.equal(seen.firstCall.needsReview, true);
    await page.close();
  });

  await record('24. Escape closes a registered overlay in a real browser', async () => {
    const page = await openAdmin(browser);
    const seen = await page.evaluate(async () => {
      const nav = await import('/admin/js/lib/navigation.js');
      let closed = 0;
      nav.pushOverlay(() => { closed += 1; });
      const openCount = nav.overlayCount();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 50));
      return { openCount, closed, left: nav.overlayCount() };
    });
    assert.equal(seen.openCount, 1);
    assert.equal(seen.closed, 1, 'Escape must dismiss the overlay');
    assert.equal(seen.left, 0);
    await page.close();
  });

  await record('25. External links are marked to open outside the WebView', async () => {
    // A bare off-origin href in a Capacitor WebView risks navigating the app
    // itself away with no way back. Every external link must say _blank.
    const page = await browser.newPage();
    await page.goto(`${BASE}/admin/js/views/field-schedule.js`);
    const sources = await page.evaluate(async () => {
      const files = [
        '/admin/js/views/field-schedule.js',
        '/admin/js/views/field-workspace.js',
        '/admin/js/views/quote.js'
      ];
      const out = {};
      for (const f of files) out[f] = await (await fetch(f)).text();
      return out;
    });

    for (const [file, src] of Object.entries(sources)) {
      const lines = src.split('\n');
      lines.forEach((line, i) => {
        if (!/maps\.google\.com/.test(line)) return;
        // The anchor's attributes may sit on the line above the href.
        const window3 = lines.slice(Math.max(0, i - 3), i + 2).join(' ');
        assert.match(window3, /target: '_blank'/,
          `${file}:${i + 1} external link must open outside the app`);
        assert.match(window3, /rel: 'noopener'/,
          `${file}:${i + 1} external link must set rel=noopener`);
      });
    }
    await page.close();
  });

  await browser.close();
  const failed = results.filter(r => !r.ok);
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} - ${r.name}${r.ok ? '' : `\n     ${r.err}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exit(1);
}

main();
