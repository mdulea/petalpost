// Fails when publishing, guest replies, the dynamic /e/{id} route, native sharing, the WhatsApp link, the guest templates prompt or the management page break in Chromium against the real API of
// scripts/server.js. Checks: an invitation published in one browser opens at /e/{id} with dynamic OG tags and via legacy ?view=1&e=; a guest's reply, its edit
// link and an edit that keeps one reply; a guest sees the free templates prompt below the reply form from page load and once after a reply; the host
// and the missing-invitation message never show it; it links to the home page templates tagged from=invite in English and Romanian; the management totals and reply list; a guest's note, which the edit link loads
// and the management page shows under its reply as text with its line breaks; the replies CSV download with its
// byte order mark, file name, columns, answers, browser time zone times, empty "Changed" cell, formula apostrophe
// and quoting, with no totals row, in English with commas and in Romanian with semicolons; the invitation link and a guessed
// secret cannot open the management page; one guest's edit link cannot load another's reply; a failed reply shows
// the failure and no confirmation, and its retry saves one reply; a reply whose confirmation is lost loads again
// after a reload and its resend keeps one reply; a reply changed elsewhere loads the latest answer; a confirmed
// withdrawal replaces the form with its panel and clears the address, Reply again shows the empty form, its old edit link says no reply is saved yet and can send, and a stale
// withdrawal loads the latest answer; the Romanian withdrawal copy; a Moț invitation published in Romanian takes a guest's reply;
// the confirmation panels of a sent, updated and withdrawn reply and of a first and a repeated publish, with their
// headings in English and Romanian, the links they show, their 250ms fade-in with a 12px rise and the focus move, and
// no panel after a failed send, withdrawal or publish; an invitation link reveals the invitation once over 400ms with
// a 12px rise, and sending or changing a reply does not replay it; under reduced motion neither the invitation nor a
// panel animates; publishing again updates the invitation, and a stale tab hears of the change; a tab opened before the first
// publish publishes to the same invitation; deletion shows guests a missing message and lets the host publish
// anew; a lost publish confirmation keeps the event identity; secrets appear only in the Authorization header;
// analytics gets page addresses without the fragment; the WhatsApp link on the published panel and the management page, in
// English and Romanian, opens wa.me in a new tab with no opener and prefills the title, the date and venue line and the
// invitation link, never the management link, and the pages request nothing from another origin; the report link of a published invitation names the invitation link and never a guest's edit secret; native navigator.share for links and PNG files with clipboard fallback and AbortError handling; in English and Romanian, a count to /api/stats with the page language after an invitation link copy, a share fallback copy, an invitation link share, a PNG share, a PNG download and a calendar file, and none after a cancelled link or PNG share or a copy of the management link, the reply edit link or the invitation link on the management page; each of those actions with the same status and file when navigator.sendBeacon throws; the page language in publish and reply bodies in English and Romanian; no page breaks the Content-Security-Policy or throws.
// Each test uses its own browser contexts for the host and every guest, so no test shares storage with another.
// Run: pnpm test:browser
import { expect, test } from '@playwright/test';
import { UI } from '../public/js/i18n.js';
import { newBrowser, publish, watch } from './browser-setup.js';

// Records each Web Animations API call on an element that matches selector as {id, keyframes, duration} in
// window.animations.
const recordAnimations = (page, selector) =>
  page.addInitScript((selector) => {
    const record = /** @type {any} */ (window);
    const animate = Element.prototype.animate;
    record.animations = [];
    Element.prototype.animate = function (keyframes, options) {
      if (this.matches(selector))
        record.animations.push({
          id: this.id,
          keyframes,
          duration: /** @type {KeyframeAnimationOptions} */ (options).duration,
        });
      return animate.call(this, keyframes, options);
    };
  }, selector);
const recordedAnimations = (page) => page.evaluate(() => /** @type {any} */ (window).animations);
const PANELS = '#published, #replySaved, #replyWithdrawn';
const RISE = [
  { opacity: 0, transform: 'translateY(12px)' },
  { opacity: 1, transform: 'none' },
];
const panelOpening = (id) => ({ id, keyframes: RISE, duration: 250 });

test('an invitation published in one browser opens in another', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation } = await publish(host.page, 'Zoe turns 30');
  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  await expect(guest.page.locator('h1')).toHaveText('Zoe turns 30');
  await expect(guest.page.locator('#previewCard .invite-title')).toHaveText('Zoe turns 30');
  expect([...host.problems, ...guest.problems]).toEqual([]);
});

// Fills and sends the reply form on an opened invitation and waits for the confirmation panel with the heading.
async function reply(page, { name, attending = true, partySize = 1, note = '', heading = 'Reply sent' }) {
  await page.fill('#guestName', name);
  await page.check(`input[name="attending"][value="${attending ? 'yes' : 'no'}"]`);
  if (attending) await page.fill('#partySize', String(partySize));
  await page.fill('#guestNote', note);
  await page.click('#sendReply');
  await expect(page.locator('#replyOutcome')).toBeVisible();
  await expect(page.locator('#replyOutcome')).toHaveText(heading);
}

// The totals and replies the management page shows, as text.
async function managed(page) {
  await expect(page.locator('#responseList')).toBeVisible();
  return {
    totals: await page.locator('#totals').innerText(),
    replies: await page.locator('#responseList li').allInnerTexts(),
  };
}

test('a guest edits a reply through the edit link, and the host sees one reply and the totals', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam', partySize: 2 });
  const editLink = await sam.page.locator('#replyLink').inputValue();
  expect(sam.page.url()).toBe(editLink);

  const samLater = await newBrowser(browser);
  await samLater.page.goto(editLink);
  await expect(samLater.page.locator('#guestName')).toHaveValue('Sam');
  await expect(samLater.page.locator('#partySize')).toHaveValue('2');
  await reply(samLater.page, { name: 'Sam Lee', partySize: 3, heading: 'Reply updated' });
  const ana = await newBrowser(browser);
  await ana.page.goto(invitation);
  await reply(ana.page, { name: 'Ana', attending: false });

  await host.page.goto(manage);
  expect(await managed(host.page)).toEqual({
    totals: expect.stringMatching(/2\s+replies[\s\S]*1\s+yes[\s\S]*1\s+no[\s\S]*3\s+people attending/i),
    replies: [expect.stringMatching(/Sam Lee[\s\S]*Yes[\s\S]*3/), expect.stringMatching(/Ana[\s\S]*No/)],
  });
  expect([...host.problems, ...sam.problems, ...samLater.problems, ...ana.problems]).toEqual([]);
});

test('a guest note loads through the edit link, and the host sees it under the reply as text with its line breaks', async ({
  browser,
}) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const note = 'No nuts, please.\n<b>We arrive at 3.</b>';
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam', partySize: 2, note: `  ${note}\n` });
  const samLater = await newBrowser(browser);
  await samLater.page.goto(await sam.page.locator('#replyLink').inputValue());
  await expect(samLater.page.locator('#guestNote')).toHaveValue(note);
  const ana = await newBrowser(browser);
  await ana.page.goto(invitation);
  await reply(ana.page, { name: 'Ana', attending: false });

  await host.page.goto(manage);
  const shown = host.page.locator('#responseList li p');
  await expect(shown).toHaveCount(1);
  await expect(host.page.locator('#responseList li').first().locator('p')).toHaveCount(1);
  expect(await shown.innerText()).toBe(note);
  await expect(shown.locator('b')).toHaveCount(0);
  expect([...host.problems, ...sam.problems, ...samLater.problems, ...ana.problems]).toEqual([]);
});

// The year-month-day hours:minutes of each minute from start to end in timeZone, as the CSV writes its times.
function minutesIn(timeZone, start, end) {
  const format = new Intl.DateTimeFormat('sv-SE', { timeZone, dateStyle: 'short', timeStyle: 'short' });
  const minutes = new Set();
  for (let t = start - (start % 60000); t <= end; t += 60000) minutes.add(format.format(t));
  return [...minutes];
}

// Clicks Download CSV on the management page and returns the file name and the file text with its byte order mark.
async function downloadCsv(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#downloadCsv')]);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return { name: download.suggestedFilename(), bytes: Buffer.concat(chunks) };
}

test('the host downloads every reply as a CSV file in the browser time zone', async ({ browser }) => {
  // A time zone 14 hours ahead of UTC, so a time in the server's UTC would show another hour.
  const timeZone = 'Pacific/Kiritimati';
  const host = await newBrowser(browser, { timezoneId: timeZone });
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const start = Date.now();
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: '=1+1', partySize: 2, note: 'No nuts, please.\nWe say "hi" at 3.' });
  const ana = await newBrowser(browser);
  await ana.page.goto(invitation);
  await reply(ana.page, { name: 'Ana', partySize: 1 });
  await reply(ana.page, { name: 'Ana Ștefănescu', attending: false, heading: 'Reply updated' });

  await host.page.goto(manage);
  await expect(host.page.locator('#responseList li')).toHaveCount(2);
  const { name, bytes } = await downloadCsv(host.page);
  const minutes = minutesIn(timeZone, start, Date.now());
  const time = `(?:${minutes.join('|')})`;
  expect({
    name,
    bom: [...bytes.subarray(0, 3)],
    rows: bytes.subarray(3).toString('utf8').split('\r\n'),
  }).toEqual({
    name: `petalpost-replies-${minutes.at(-1).slice(0, 10)}.csv`,
    bom: [0xef, 0xbb, 0xbf],
    rows: [
      'Name,Attending,Party size,Note,Replied,Changed',
      expect.stringMatching(new RegExp(`^'=1\\+1,Yes,2,"No nuts, please\\.\\nWe say ""hi"" at 3\\.",${time},$`)),
      expect.stringMatching(new RegExp(`^Ana Ștefănescu,No,0,,${time},${time}$`)),
      '',
    ],
  });
  expect([...host.problems, ...sam.problems, ...ana.problems]).toEqual([]);
});

test('a guest withdraws a reply after confirming, and a new send makes a separate reply under a new link', async ({
  browser,
}) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await expect(sam.page.locator('#withdrawReply')).toBeHidden();
  await reply(sam.page, { name: 'Sam', partySize: 2 });
  const oldLink = await sam.page.locator('#replyLink').inputValue();

  sam.page.once('dialog', (dialog) => dialog.dismiss());
  await sam.page.click('#withdrawReply');
  await expect(sam.page.locator('#guestName')).toHaveValue('Sam');
  sam.page.once('dialog', (dialog) => dialog.accept());
  await sam.page.click('#withdrawReply');
  await expect(sam.page.locator('#replyWithdrawn')).toBeVisible();
  await expect(sam.page.locator('#rsvpForm')).toBeHidden();
  expect(sam.page.url()).toBe(invitation);

  await sam.page.click('#replyAgain');
  await expect(sam.page.locator('#replyWithdrawn')).toBeHidden();
  expect({
    name: await sam.page.locator('#guestName').inputValue(),
    note: await sam.page.locator('#guestNote').inputValue(),
    saved: await sam.page.locator('#replySaved').isVisible(),
  }).toEqual({ name: '', note: '', saved: false });
  await reply(sam.page, { name: 'Sam again' });
  const newLink = await sam.page.locator('#replyLink').inputValue();
  await host.page.goto(manage);
  expect({ same: newLink === oldLink, replies: (await managed(host.page)).replies }).toEqual({
    same: false,
    replies: [expect.stringMatching(/^Sam again\b/)],
  });
  expect([...host.problems, ...sam.problems]).toEqual([]);
});

test('each confirmation panel fades in and rises with its heading and takes focus', async ({ browser }) => {
  const host = await newBrowser(browser);
  await recordAnimations(host.page, PANELS);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  await expect(host.page.locator('#published')).toBeFocused();
  expect({
    heading: await host.page.locator('#publishOutcome').innerText(),
    links: await host.page.locator('#published input').evaluateAll((inputs) => inputs.map((i) => i.id)),
    status: await host.page.locator('#publishStatus').innerText(),
  }).toEqual({ heading: 'Invitation published', links: ['eventLink', 'manageLink'], status: '' });
  await host.page.click('#publish');
  await expect(host.page.locator('#publishOutcome')).toHaveText('Changes published');
  await expect(host.page.locator('#published')).toBeFocused();
  expect([
    await host.page.locator('#eventLink').inputValue(),
    await host.page.locator('#manageLink').inputValue(),
  ]).toEqual([invitation, manage]);

  expect(await recordedAnimations(host.page)).toEqual([panelOpening('published'), panelOpening('published')]);

  const sam = await newBrowser(browser);
  await recordAnimations(sam.page, PANELS);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  await expect(sam.page.locator('#replySaved')).toBeFocused();
  await expect(sam.page.locator('#replySaved #replyLink')).toHaveValue(sam.page.url());
  await expect(sam.page.locator('#rsvpStatus')).toHaveText('');
  await reply(sam.page, { name: 'Sam Lee', heading: 'Reply updated' });
  await expect(sam.page.locator('#replySaved')).toBeFocused();

  sam.page.once('dialog', (dialog) => dialog.accept());
  await sam.page.click('#withdrawReply');
  await expect(sam.page.locator('#replyWithdrawn')).toBeVisible();
  await expect(sam.page.locator('#replyWithdrawn h2')).toHaveText('Reply withdrawn');
  await expect(sam.page.locator('#replyWithdrawn')).toBeFocused();
  expect(await recordedAnimations(sam.page)).toEqual([
    panelOpening('replySaved'),
    panelOpening('replySaved'),
    panelOpening('replyWithdrawn'),
  ]);
  await sam.page.click('#replyAgain');
  await expect(sam.page.locator('#guestName')).toBeFocused();
  expect([...host.problems, ...sam.problems]).toEqual([]);
});

test('an invitation link reveals the invitation once, and sending or changing a reply does not replay it', async ({
  browser,
}) => {
  const host = await newBrowser(browser);
  const { invitation } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await recordAnimations(sam.page, '#previewCard');
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  await reply(sam.page, { name: 'Sam Lee', heading: 'Reply updated' });
  await expect
    .poll(() => sam.page.evaluate(() => document.getElementById('previewCard').getAnimations().length))
    .toBe(0);
  expect(await recordedAnimations(sam.page)).toEqual([{ id: 'previewCard', keyframes: RISE, duration: 400 }]);
  expect(await sam.page.locator('#previewCard').evaluate((card) => getComputedStyle(card).opacity)).toBe('1');
  expect([...host.problems, ...sam.problems]).toEqual([]);
});

test('under reduced motion the invitation and the confirmation panels open without animation', async ({ browser }) => {
  const host = await newBrowser(browser, { reducedMotion: 'reduce' });
  await recordAnimations(host.page, PANELS);
  const { invitation } = await publish(host.page, 'Zoe turns 30');
  await expect(host.page.locator('#published')).toBeFocused();
  expect(await recordedAnimations(host.page)).toEqual([]);

  const sam = await newBrowser(browser, { reducedMotion: 'reduce' });
  await recordAnimations(sam.page, `#previewCard, ${PANELS}`);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  await expect(sam.page.locator('#replySaved')).toBeFocused();
  sam.page.once('dialog', (dialog) => dialog.accept());
  await sam.page.click('#withdrawReply');
  await expect(sam.page.locator('#replyWithdrawn')).toBeFocused();
  expect(await recordedAnimations(sam.page)).toEqual([]);
  expect(await sam.page.evaluate(() => document.getAnimations().length)).toBe(0);
  expect([...host.problems, ...sam.problems]).toEqual([]);
});

test('a withdrawn reply edit link says no reply is saved under it yet and can still send one', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  const oldLink = await sam.page.locator('#replyLink').inputValue();
  sam.page.once('dialog', (dialog) => dialog.accept());
  await sam.page.click('#withdrawReply');
  await expect(sam.page.locator('#replySaved')).toBeHidden();

  const samLater = await newBrowser(browser);
  await samLater.page.goto(oldLink);
  await expect(samLater.page.locator('#rsvpStatus')).toHaveText(
    'No reply is saved under this link yet. Send the form to save one.',
  );
  await expect(samLater.page.locator('#withdrawReply')).toBeHidden();
  await reply(samLater.page, { name: 'Sam Lee' });
  await host.page.goto(manage);
  expect((await managed(host.page)).replies).toEqual([expect.stringMatching(/^Sam Lee\b/)]);
  expect([...host.problems, ...sam.problems, ...samLater.problems]).toEqual([]);
});

test('a withdrawal from a stale page fails and shows the latest answer', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  const samPhone = await newBrowser(browser);
  await samPhone.page.goto(await sam.page.locator('#replyLink').inputValue());
  await expect(samPhone.page.locator('#guestName')).toHaveValue('Sam');
  await reply(samPhone.page, { name: 'Sam from the phone', partySize: 4, heading: 'Reply updated' });

  sam.page.once('dialog', (dialog) => dialog.accept());
  await sam.page.click('#withdrawReply');
  await expect(sam.page.locator('#rsvpStatus')).toHaveText(
    'This reply changed in another browser. The latest answer is shown.',
  );
  await expect(sam.page.locator('#replyWithdrawn')).toBeHidden();
  await expect(sam.page.locator('#replyOutcome')).toBeHidden();
  await expect(sam.page.locator('#guestName')).toHaveValue('Sam from the phone');
  await host.page.goto(manage);
  expect((await managed(host.page)).replies).toEqual([expect.stringMatching(/^Sam from the phone\b/)]);
  expect([...host.problems, ...sam.problems, ...samPhone.problems]).toEqual([]);
});

test('the invitation link and a guessed secret cannot open the management page', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  const eventId = new URL(invitation).pathname.split('/').pop();
  const guessed = manage.replace(/\.[^.]+$/, `.${'x'.repeat(43)}`);

  // A browser of its own for each link: a link that differs only after the # would not reload the page.
  const strangers = [];
  const seen = [];
  for (const link of [manage.replace(/#.*/, `#${eventId}`), guessed]) {
    const stranger = await newBrowser(browser);
    strangers.push(...stranger.problems);
    await stranger.page.goto(link);
    await expect(stranger.page.locator('#manageStatus')).not.toHaveText(/Loading|^$/);
    seen.push([
      await stranger.page.locator('#manageStatus').innerText(),
      await stranger.page.locator('main').innerText(),
    ]);
  }
  expect(seen).toEqual([
    [
      'This management link is incomplete. Open the whole link from where you saved it.',
      expect.not.stringContaining('Sam'),
    ],
    ['This link does not give access to this invitation.', expect.not.stringContaining('Sam')],
  ]);
  expect([...host.problems, ...sam.problems, ...strangers]).toEqual([]);
});

test("one guest's edit link cannot load another guest's reply", async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  const samLink = await sam.page.locator('#replyLink').inputValue();
  const ana = await newBrowser(browser);
  await ana.page.goto(invitation);
  await reply(ana.page, { name: 'Ana' });
  const anaLink = await ana.page.locator('#replyLink').inputValue();

  // Sam's reply id with Ana's secret, in a new browser because Ana's page would treat it as a jump within the page.
  const mixed = await newBrowser(browser);
  await mixed.page.goto(samLink.replace(/\.[^.]+$/, anaLink.slice(anaLink.lastIndexOf('.'))));
  await expect(mixed.page.locator('#rsvpStatus')).toHaveText('This link does not give access to this reply.');
  await expect(mixed.page.locator('#guestName')).toHaveValue('');
  expect([...host.problems, ...sam.problems, ...ana.problems, ...mixed.problems]).toEqual([]);
});

test('a failed reply shows the failure without a confirmation, and the retry saves exactly one reply', async ({
  browser,
}) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await sam.page.route('**/api/events/*/responses/*', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Storage is unavailable right now. Nothing was changed. Try again in a minute.' }),
    }),
  );
  await sam.page.fill('#guestName', 'Sam');
  await sam.page.click('#sendReply');
  await expect(sam.page.locator('#rsvpStatus')).toHaveText(
    'Storage is unavailable right now. Nothing was changed. Try again in a minute.',
  );
  await expect(sam.page.locator('#replySaved')).toBeHidden();

  await sam.page.unrouteAll();
  await reply(sam.page, { name: 'Sam' });
  await reply(sam.page, { name: 'Sam', heading: 'Reply updated' });
  await host.page.goto(manage);
  expect((await managed(host.page)).replies).toEqual([expect.stringMatching(/^Sam\b/)]);
  expect([...host.problems, ...sam.problems]).toEqual([]);
});

test('a reply whose confirmation is lost loads again after a reload, and the resend keeps one reply', async ({
  browser,
}) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  // The first PUT reaches the server and commits, but the page gets a 503 instead of the answer.
  await sam.page.route(
    '**/api/events/*/responses/*',
    async (route) => {
      await route.fetch();
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Lost.' }) });
    },
    { times: 1 },
  );
  await sam.page.fill('#guestName', 'Sam');
  await sam.page.click('#sendReply');
  await expect(sam.page.locator('#rsvpStatus')).toHaveText('Lost.');

  await sam.page.reload();
  await expect(sam.page.locator('#guestName')).toHaveValue('Sam');
  await reply(sam.page, { name: 'Sam Lee', heading: 'Reply updated' });
  await host.page.goto(manage);
  expect((await managed(host.page)).replies).toEqual([expect.stringMatching(/^Sam Lee\b/)]);
  expect([...host.problems, ...sam.problems]).toEqual([]);
});

test('a reply changed in another browser loads the latest answer and says so', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  const editLink = await sam.page.locator('#replyLink').inputValue();
  const samPhone = await newBrowser(browser);
  await samPhone.page.goto(editLink);
  await expect(samPhone.page.locator('#guestName')).toHaveValue('Sam');
  await reply(samPhone.page, { name: 'Sam from the phone', partySize: 4, heading: 'Reply updated' });

  await sam.page.fill('#guestName', 'Sam from the laptop');
  await sam.page.click('#sendReply');
  await expect(sam.page.locator('#rsvpStatus')).toHaveText(
    'This reply changed in another browser. The latest answer is shown.',
  );
  await expect(sam.page.locator('#replyOutcome')).toBeHidden();
  expect([
    await sam.page.locator('#guestName').inputValue(),
    await sam.page.locator('#partySize').inputValue(),
  ]).toEqual(['Sam from the phone', '4']);
  expect([...host.problems, ...sam.problems, ...samPhone.problems]).toEqual([]);
});

test('publishing again updates the invitation, and a stale tab is told before it replaces the changes', async ({
  browser,
}) => {
  const host = await newBrowser(browser);
  const { invitation } = await publish(host.page, 'Zoe turns 30');
  const staleTab = await host.page.context().newPage();
  const staleProblems = watch(staleTab);
  await staleTab.goto('editor.html');
  await expect(staleTab.locator('#eventLink')).toHaveValue(invitation);

  await host.page.fill('#title', 'Zoe turns 31');
  await host.page.click('#publish');
  await expect(host.page.locator('#publishOutcome')).toHaveText('Changes published');
  await staleTab.click('#publish');
  await expect(staleTab.locator('#publishStatus')).toHaveText(
    'This invitation changed in another browser since you last published. Publishing again replaces those changes.',
  );
  await expect(staleTab.locator('#publishOutcome')).toBeHidden();
  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  await expect(guest.page.locator('h1')).toHaveText('Zoe turns 31');
  expect([...host.problems, ...staleProblems, ...guest.problems]).toEqual([]);
});

test('a tab opened before the first publish publishes to the same invitation', async ({ browser }) => {
  const host = await newBrowser(browser);
  const earlyTab = await host.page.context().newPage();
  const earlyProblems = watch(earlyTab);
  await earlyTab.goto('editor.html?t=birthday');
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');

  await earlyTab.click('#publish');
  await expect(earlyTab.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
  await host.page.reload();
  expect({
    early: [await earlyTab.locator('#eventLink').inputValue(), await earlyTab.locator('#manageLink').inputValue()],
    stored: [await host.page.locator('#eventLink').inputValue(), await host.page.locator('#manageLink').inputValue()],
  }).toEqual({ early: [invitation, manage], stored: [invitation, manage] });
  expect([...host.problems, ...earlyProblems]).toEqual([]);
});

test('deleting the invitation shows guests a missing message and lets the host publish a new one', async ({
  browser,
}) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const manager = await host.page.context().newPage();
  const managerProblems = watch(manager);
  await manager.goto(manage);
  await expect(manager.locator('#noReplies')).toBeVisible();
  manager.once('dialog', (dialog) => dialog.accept());
  await manager.click('#deleteEvent');
  await expect(manager.locator('#manageStatus')).toHaveText(
    'The invitation and all its replies are deleted from Petalpost.',
  );

  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  await expect(guest.page.locator('#status')).toHaveText('This invitation does not exist. It may have been deleted.');
  await expect(guest.page.locator('#previewCard')).toBeHidden();
  await expect(guest.page.locator('#rsvpForm')).toBeHidden();
  await expect(guest.page.locator('#replyCta')).toBeHidden();

  await host.page.click('#publish');
  await expect(host.page.locator('#publishStatus')).toHaveText(
    'This invitation was deleted with its replies. Publish again to make a new invitation link.',
  );
  await expect(host.page.locator('#published')).toBeHidden();
  await host.page.click('#publish');
  await expect(host.page.locator('#eventLink')).not.toHaveValue(invitation);
  expect([...host.problems, ...managerProblems, ...guest.problems]).toEqual([]);
});

test('private secrets travel only in the Authorization header', async ({ browser }) => {
  const sent = [];
  const record = (page) =>
    page.on('request', async (request) =>
      sent.push({
        url: request.url(),
        body: request.postData() ?? '',
        auth: (await request.allHeaders()).authorization,
      }),
    );
  const host = await newBrowser(browser);
  record(host.page);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  record(sam.page);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  const editLink = await sam.page.locator('#replyLink').inputValue();
  await sam.page.goto(editLink);
  await expect(sam.page.locator('#guestName')).toHaveValue('Sam');
  await host.page.goto(manage);
  await managed(host.page);

  const secrets = [manage, editLink].map((link) => link.slice(link.lastIndexOf('.') + 1));
  const leaks = sent.filter(({ url, body }) => secrets.some((s) => url.includes(s) || body.includes(s)));
  const carried = secrets.map((s) => sent.some(({ auth }) => auth === `Bearer ${s}`));
  expect({ leaks, carried }).toEqual({ leaks: [], carried: [true, true] });
  expect([...host.problems, ...sam.problems]).toEqual([]);
});

test('a publish whose confirmation is lost keeps its event identity, and the retry shows the links', async ({
  browser,
}) => {
  const host = await newBrowser(browser);
  const created = [];
  host.page.on('request', (request) => {
    if (request.method() === 'PUT') created.push(new URL(request.url()).pathname);
  });
  // The first PUT reaches the server and commits, but the page gets a 503 instead of the answer.
  await host.page.route(
    '**/api/events/*',
    async (route) => {
      await route.fetch();
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Lost.' }) });
    },
    { times: 1 },
  );
  await host.page.goto('editor.html?t=birthday');
  await host.page.fill('#title', 'Zoe turns 30');
  await host.page.click('#publish');
  await expect(host.page.locator('#publishStatus')).toHaveText('Lost.');
  await expect(host.page.locator('#published')).toBeHidden();

  await host.page.reload();
  await host.page.click('#publish');
  await expect(host.page.locator('#publishOutcome')).toHaveText('Invitation published');
  const id = new URL(await host.page.locator('#eventLink').inputValue()).pathname.split('/').pop();
  expect(new Set(created)).toEqual(new Set([`/api/events/${id}`]));
  expect(host.problems).toEqual([]);
});

test('analytics receives page addresses without the private part after the #', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { manage } = await publish(host.page, 'Zoe turns 30');
  await host.page.goto(manage);
  const sent = await host.page.evaluate((url) => {
    const [, beforeSend] = [...window.vaq].find((args) => args[0] === 'beforeSend');
    return beforeSend({ type: 'pageview', url });
  }, manage);
  expect(sent).toEqual({ type: 'pageview', url: manage.split('#')[0] });
  expect(host.problems).toEqual([]);
});

test("the report link names the invitation link and never the guest's edit secret", async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation } = await publish(host.page, 'Zoe turns 30');
  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  await reply(guest.page, { name: 'Sam' });
  // The reply put the edit link, with its secret after #r=, in the address bar.
  expect(guest.page.url()).toContain('#r=');
  const href = await guest.page.locator('#reportLink').getAttribute('href');
  const body = new URL(href).searchParams.get('body');
  expect({ to: new URL(href).pathname, names: body.includes(invitation), secret: /#r=|r=/.test(body) }).toEqual({
    to: 'contact@petalpost.ro',
    names: true,
    secret: false,
  });
  expect([...host.problems, ...guest.problems]).toEqual([]);
});

test('published /e/{id} serves dynamic OG tags and legacy ?view=1&e= links still open', async ({
  browser,
  request,
}) => {
  const host = await newBrowser(browser);
  await host.page.goto('editor.html?t=birthday');
  await host.page.fill('#title', 'Zoe turns 30');
  await host.page.fill('#date', '2026-12-12');
  await host.page.fill('#time', '14:00');
  await host.page.fill('#venue', 'Willow Park');
  await host.page.click('#publish');
  await expect(host.page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
  const invitation = await host.page.locator('#eventLink').inputValue();
  const eventId = new URL(invitation).pathname.split('/').pop();

  const raw = await request.get(invitation);
  const html = await raw.text();
  expect(raw.status()).toBe(200);
  expect(html).toContain('<meta property="og:title" content="Zoe turns 30 | Petalpost" />');
  expect(html).toContain(
    '<meta property="og:description" content="Saturday, December 12, 2026 at 2:00 PM · Willow Park" />',
  );
  expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');

  const legacyGuest = await newBrowser(browser);
  await legacyGuest.page.goto(`editor.html?view=1&e=${eventId}`);
  await expect(legacyGuest.page.locator('h1')).toHaveText('Zoe turns 30');
  await expect(legacyGuest.page.locator('#rsvpForm')).toBeVisible();
  expect([...host.problems, ...legacyGuest.problems]).toEqual([]);
});

test('a guest sees the free templates prompt once from page load, and the host never sees it', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation } = await publish(host.page, 'Zoe turns 30');
  await expect(host.page.locator('#replyCta')).toBeHidden();
  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  const prompt = guest.page.getByText('Planning an event of your own?');
  await expect(guest.page.locator('#replyCta')).toBeVisible();
  await expect(guest.page.locator('#replyCta + #reportRow')).toBeVisible();
  await reply(guest.page, { name: 'Sam', partySize: 2 });
  await expect(prompt).toHaveCount(1);
  await expect(prompt).toBeVisible();
  const ctaLink = guest.page.locator('#replyCta a');
  await expect(ctaLink).toHaveAttribute('href', '/?from=invite#templates');
  await ctaLink.click();
  await expect(guest.page).toHaveURL(/\/\?from=invite#templates$/);
  await expect(guest.page.locator('#gallery .card').first()).toBeVisible();
  expect([...host.problems, ...guest.problems]).toEqual([]);
});

// The WhatsApp link of the page as its label, how it opens, its address and the lines of its prefilled message.
async function whatsappMessage(page) {
  const link = page.locator('#whatsappEventLink');
  await expect(link).toBeVisible();
  const url = new URL(await link.getAttribute('href'));
  return {
    label: (await link.innerText()).trim(),
    target: await link.getAttribute('target'),
    rel: await link.getAttribute('rel'),
    address: url.origin + url.pathname,
    lines: url.searchParams.get('text').split('\n'),
  };
}

// Requests a page makes to an origin other than origin, the local server.
function foreignRequests(page, origin) {
  const foreign = [];
  page.on('request', (req) => {
    if (new URL(req.url()).origin !== origin) foreign.push(req.url());
  });
  return foreign;
}

test('a host sends the invitation link on WhatsApp from the published panel and the management page', async ({
  browser,
  baseURL,
}) => {
  const host = await newBrowser(browser);
  const foreign = foreignRequests(host.page, new URL(baseURL).origin);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const expected = {
    label: 'Send on WhatsApp',
    target: '_blank',
    rel: 'noopener',
    address: 'https://wa.me/',
    lines: ['Zoe turns 30', 'Saturday, December 12, 2026 at 2:00 PM · Willow Park Pavilion', invitation],
  };
  expect(await whatsappMessage(host.page)).toEqual(expected);
  await host.page.goto(manage);
  await expect(host.page.locator('#eventLink')).toHaveValue(invitation);
  expect(await whatsappMessage(host.page)).toEqual(expected);
  expect(foreign).toEqual([]);
  expect(host.problems).toEqual([]);
});

// An init script that replaces navigator.share, navigator.canShare and the clipboard. window.__shareTest records
// each share as calls and each copied text as copied, and failNext(name) makes the next share throw a DOMException
// with that name. pending is true until that share is attempted.
function stubShare() {
  const calls = [];
  const copied = [];
  let nextError = null;
  /** @type {any} */ (window).__shareTest = {
    calls,
    copied,
    failNext(name) {
      nextError = name;
    },
    get pending() {
      return nextError !== null;
    },
  };
  Object.defineProperty(navigator, 'canShare', {
    configurable: true,
    value: (data) => Boolean(data?.files?.length),
  });
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: async (data) => {
      if (nextError) {
        const err = new DOMException('Share stopped', nextError);
        nextError = null;
        throw err;
      }
      calls.push({
        title: data.title,
        text: data.text,
        url: data.url,
        files: data.files?.map((f) => ({ name: f.name, type: f.type, size: f.size })),
      });
    },
  });
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text) => {
        copied.push(text);
      },
    },
  });
}

// Records the parsed body of each request the page sends to /api/stats.
function recordCounts(page) {
  const counts = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/stats') counts.push(JSON.parse(request.postData() ?? 'null'));
  });
  return counts;
}

test('native navigator.share shares invitation links and PNG files, ignores abort and falls back to copy', async ({
  browser,
}) => {
  const noShare = await newBrowser(browser);
  await noShare.page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  await noShare.page.goto('editor.html?t=birthday');
  await expect(noShare.page.locator('#shareLink')).toHaveCount(0);
  await expect(noShare.page.locator('#shareEventLink')).toBeHidden();
  await expect(noShare.page.locator('#sharePng')).toBeHidden();

  const context = await browser.newContext();
  await context.addInitScript(stubShare);
  const page = await context.newPage();
  const problems = watch(page);
  const { invitation } = await publish(page, 'Zoe turns 30');

  await expect(page.locator('#shareEventLink')).toBeVisible();
  await expect(page.locator('#shareLink')).toHaveCount(0);
  await expect(page.locator('#sharePng')).toBeVisible();

  const initialStatus = await page.locator('#publishStatus').textContent();
  await page.evaluate(() => /** @type {any} */ (window).__shareTest.failNext('AbortError'));
  await page.click('#shareEventLink');
  await expect(page.locator('#publishStatus')).toHaveText(initialStatus);

  await page.evaluate(() => /** @type {any} */ (window).__shareTest.failNext('NotAllowedError'));
  await page.click('#shareEventLink');
  await expect(page.locator('#publishStatus')).toHaveText(
    'Invitation link copied. Paste it into a message to your guests.',
  );

  await page.click('#shareEventLink');
  await expect(page.locator('#publishStatus')).toHaveText('Invitation link shared.');

  await page.waitForFunction(() => typeof htmlToImage === 'object');
  await page.click('#sharePng');
  await expect(page.locator('#status')).toHaveText('Invite shared.');

  const recorded = await page.evaluate(() => ({
    calls: /** @type {any} */ (window).__shareTest.calls,
    copied: /** @type {any} */ (window).__shareTest.copied,
  }));
  expect(recorded.calls[0]).toMatchObject({ title: 'Zoe turns 30', url: invitation });
  expect(recorded.calls[1].title).toBe('Zoe turns 30');
  expect(recorded.calls[1].files[0].name).toBe('zoe-turns-30.png');
  expect(recorded.calls[1].files[0].type).toBe('image/png');
  expect(recorded.calls[1].files[0].size).toBeGreaterThan(10000);
  expect(recorded.copied).toEqual([invitation]);
  expect([...noShare.problems, ...problems]).toEqual([]);
});

// A browser of its own with the share stub and any further init scripts, and the counts its page sends.
async function stubbedBrowser(browser, ...scripts) {
  const context = await browser.newContext();
  for (const script of [stubShare, ...scripts]) await context.addInitScript(script);
  const page = await context.newPage();
  return { page, problems: watch(page), counts: recordCounts(page) };
}
const failNext = (page, name) => page.evaluate((name) => /** @type {any} */ (window).__shareTest.failNext(name), name);
const shareSettled = (page) => page.waitForFunction(() => !(/** @type {any} */ (window).__shareTest.pending));

// Publishes the invitation that the editor address opens and returns the links the editor shows.
async function publishFrom(page, editor) {
  await page.goto(editor);
  await page.click('#publish');
  await expect(page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
  return {
    invitation: await page.locator('#eventLink').inputValue(),
    manage: await page.locator('#manageLink').inputValue(),
  };
}

for (const { lang, editor } of [
  { lang: 'en', editor: 'editor.html?t=birthday' },
  { lang: 'ro', editor: '/ro/editor.html?t=botez-porumbel' },
]) {
  test(`in ${lang}, each delivery action and the calendar file send their count with the page language, and a cancelled share or another link copy sends nothing`, async ({
    browser,
  }) => {
    const { editor: editorCopy, manage: manageCopy } = UI[lang];
    const host = await stubbedBrowser(browser);
    const { page } = host;
    const { invitation, manage } = await publishFrom(page, editor);
    const publishStatus = page.locator('#publishStatus');

    await page.click('#copyEventLink');
    await expect(publishStatus).toHaveText(editorCopy.eventLinkCopied);
    await page.click('#copyManageLink');
    await expect(publishStatus).toHaveText(editorCopy.manageLinkCopied);
    await failNext(page, 'AbortError');
    await page.click('#shareEventLink');
    await shareSettled(page);
    await failNext(page, 'NotAllowedError');
    await page.click('#shareEventLink');
    await expect(publishStatus).toHaveText(editorCopy.eventLinkCopied);
    await page.click('#shareEventLink');
    await expect(publishStatus).toHaveText(editorCopy.eventLinkShared);
    await page.waitForFunction(() => typeof htmlToImage === 'object');
    await failNext(page, 'AbortError');
    await page.click('#sharePng');
    await shareSettled(page);
    await expect(page.locator('#sharePng')).toBeEnabled();
    await page.click('#sharePng');
    await expect(page.locator('#status')).toHaveText(editorCopy.inviteShared);
    const download = page.waitForEvent('download');
    await page.click('#downloadPng');
    await download;
    await page.goto(manage);
    await expect(page.locator('#copyEventLink')).toBeVisible();
    await page.click('#copyEventLink');
    await expect(page.locator('#manageStatus')).toHaveText(manageCopy.eventLinkCopied);

    const guest = await stubbedBrowser(browser);
    await guest.page.goto(invitation);
    const calendar = guest.page.waitForEvent('download');
    await guest.page.click('#addCalendar');
    await calendar;
    await reply(guest.page, { name: 'Sam', heading: editorCopy.replySent });
    await guest.page.click('#copyReplyLink');
    await expect(guest.page.locator('#rsvpStatus')).toHaveText(editorCopy.replyLinkCopied);

    const counted = (actions) => actions.map((action) => ({ action, lang }));
    await expect
      .poll(() => host.counts)
      .toEqual(
        counted(['invitation_link_copy', 'invitation_link_copy', 'invitation_link_share', 'png_share', 'png_download']),
      );
    await expect.poll(() => guest.counts).toEqual(counted(['calendar_add']));
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });

  test(`in ${lang}, each delivery action and the calendar file work the same when the count cannot be sent`, async ({
    browser,
  }) => {
    const editorCopy = UI[lang].editor;
    const failingBeacon = () =>
      Object.defineProperty(navigator, 'sendBeacon', {
        configurable: true,
        value: () => {
          throw new TypeError('sendBeacon is blocked');
        },
      });
    const host = await stubbedBrowser(browser, failingBeacon);
    const { page } = host;
    const { invitation } = await publishFrom(page, editor);
    const publishStatus = page.locator('#publishStatus');
    await page.click('#copyEventLink');
    await expect(publishStatus).toHaveText(editorCopy.eventLinkCopied);
    await failNext(page, 'NotAllowedError');
    await page.click('#shareEventLink');
    await shareSettled(page);
    await expect(publishStatus).toHaveText(editorCopy.eventLinkCopied);
    await page.click('#shareEventLink');
    await expect(publishStatus).toHaveText(editorCopy.eventLinkShared);
    await page.waitForFunction(() => typeof htmlToImage === 'object');
    await page.click('#sharePng');
    await expect(page.locator('#status')).toHaveText(editorCopy.inviteShared);
    const download = page.waitForEvent('download');
    await page.click('#downloadPng');
    expect((await download).suggestedFilename()).toMatch(/\.png$/);
    await expect(page.locator('#status')).toHaveText(editorCopy.downloaded);

    const guest = await stubbedBrowser(browser, failingBeacon);
    await guest.page.goto(invitation);
    const calendar = guest.page.waitForEvent('download');
    await guest.page.click('#addCalendar');
    expect((await calendar).suggestedFilename()).toMatch(/\.ics$/);

    const recorded = await page.evaluate(() => {
      const { calls, copied } = /** @type {any} */ (window).__shareTest;
      return { shares: calls.length, copied: copied.length };
    });
    expect({ recorded, counts: [...host.counts, ...guest.counts] }).toEqual({
      recorded: { shares: 2, copied: 2 },
      counts: [],
    });
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });
}

test('publish and reply requests carry the page language in English and Romanian', async ({ browser }) => {
  // Records the lang of each PUT body to /api/events.
  const record = (page) => {
    const langs = [];
    page.on('request', (request) => {
      if (request.method() === 'PUT' && new URL(request.url()).pathname.startsWith('/api/events/'))
        langs.push(JSON.parse(request.postData() ?? 'null').lang);
    });
    return langs;
  };
  const langs = {};
  for (const [lang, editor] of [
    ['en', 'editor.html?t=birthday'],
    ['ro', '/ro/editor.html?t=botez-porumbel'],
  ]) {
    const host = await newBrowser(browser);
    const published = record(host.page);
    await host.page.goto(editor);
    await host.page.click('#publish');
    await expect(host.page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
    const guest = await newBrowser(browser);
    const replied = record(guest.page);
    await guest.page.goto(await host.page.locator('#eventLink').inputValue());
    await guest.page.fill('#guestName', 'Sam');
    await guest.page.check('input[name="attending"][value="yes"]');
    await guest.page.click('#sendReply');
    await expect(guest.page.locator('#replyOutcome')).toBeVisible();
    langs[lang] = { published, replied };
    expect([...host.problems, ...guest.problems]).toEqual([]);
  }
  expect(langs).toEqual({ en: { published: ['en'], replied: ['en'] }, ro: { published: ['ro'], replied: ['ro'] } });
});

test('Romanian publishing, guest RSVP and management keep links and copy in Romanian', async ({ browser, request }) => {
  const host = await newBrowser(browser);
  await host.page.goto('/ro/editor.html?t=botez-porumbel');
  await host.page.fill('#title', 'Botezul lui Matei');
  await host.page.click('#publish');
  await expect(host.page.locator('#publishOutcome')).toHaveText('Invitație publicată');
  await expect(host.page.locator('#eventLink')).toHaveValue(/\/ro\/e\/[A-Za-z0-9_-]{22}$/);
  await expect(host.page.locator('#manageLink')).toHaveValue(/\/ro\/manage\.html#/);
  await expect(host.page.locator('#replyCta')).toBeHidden();
  const invitation = await host.page.locator('#eventLink').inputValue();
  const manage = await host.page.locator('#manageLink').inputValue();
  const whatsapp = {
    label: 'Trimite pe WhatsApp',
    target: '_blank',
    rel: 'noopener',
    address: 'https://wa.me/',
    lines: ['Botezul lui Matei', expect.stringMatching(/, ora 11:00 · \S/), invitation],
  };
  expect(await whatsappMessage(host.page)).toEqual(whatsapp);

  const raw = await request.get(invitation);
  const html = await raw.text();
  expect(raw.status()).toBe(200);
  expect(html).toContain('<html lang="ro">');
  expect(html).toContain('<meta property="og:title" content="Botezul lui Matei | Petalpost" />');
  expect(html).toContain('ora 11:00');
  expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');

  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  await expect(guest.page.locator('h1')).toHaveText('Botezul lui Matei');
  await expect(guest.page.locator('#replyCta a')).toHaveAttribute('href', '/ro/?from=invite#templates');
  await guest.page.fill('#guestName', 'Ștefan');
  await guest.page.fill('#partySize', '2');
  await guest.page.fill('#guestNote', 'Venim; mulțumim!');
  await guest.page.click('#sendReply');
  await expect(guest.page.locator('#replyOutcome')).toHaveText('Răspuns trimis');
  await guest.page.click('#sendReply');
  await expect(guest.page.locator('#replyOutcome')).toHaveText('Răspuns actualizat');
  await expect(guest.page.getByText('Organizezi un eveniment?')).toHaveCount(1);

  await host.page.goto(manage);
  expect(await whatsappMessage(host.page)).toEqual(whatsapp);
  expect(await managed(host.page)).toEqual({
    totals: expect.stringMatching(/1\s+răspuns[\s\S]*1\s+confirmare[\s\S]*0\s+refuzuri[\s\S]*2\s+persoane confirmate/i),
    replies: [expect.stringMatching(/Ștefan[\s\S]*Da, 2 persoane/)],
  });
  const { name, bytes } = await downloadCsv(host.page);
  expect({ name, bom: [...bytes.subarray(0, 3)], rows: bytes.subarray(3).toString('utf8').split('\r\n') }).toEqual({
    name: expect.stringMatching(/^petalpost-raspunsuri-\d{4}-\d{2}-\d{2}\.csv$/),
    bom: [0xef, 0xbb, 0xbf],
    rows: [
      'Nume;Participă;Persoane;Notă;A răspuns;Modificat',
      expect.stringMatching(
        /^Ștefan;Da;2;"Venim; mulțumim!";\d{4}-\d{2}-\d{2} \d{2}:\d{2};\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/,
      ),
      '',
    ],
  });

  const stranger = await newBrowser(browser);
  await stranger.page.goto(manage.replace(/\.[^.]+$/, `.${'x'.repeat(43)}`));
  await expect(stranger.page.locator('#manageStatus')).toHaveText('Acest link nu oferă acces la această invitație.');

  const editLink = await guest.page.locator('#replyLink').inputValue();
  let question = '';
  guest.page.once('dialog', (dialog) => {
    question = dialog.message();
    dialog.accept();
  });
  await guest.page.click('#withdrawReply');
  await expect(guest.page.locator('#replyWithdrawn')).toBeVisible();
  await expect(guest.page.locator('#replyWithdrawn h2')).toHaveText('Răspuns retras');
  await expect(guest.page.locator('#replyAgain')).toHaveText('Răspunde din nou');
  expect({ question, url: guest.page.url() }).toEqual({
    question: 'Retragi răspunsul? Gazda nu îl va mai vedea.',
    url: invitation,
  });
  const guestLater = await newBrowser(browser);
  await guestLater.page.goto(editLink);
  await expect(guestLater.page.locator('#rsvpStatus')).toHaveText(
    'Încă nu există un răspuns salvat la acest link. Trimite formularul pentru a-l salva.',
  );
  expect([...host.problems, ...guest.problems, ...stranger.problems, ...guestLater.problems]).toEqual([]);
});

test('a Moț invitation publishes in Romanian and a guest replies through its link', async ({ browser }) => {
  const host = await newBrowser(browser);
  await host.page.goto('/ro/editor.html?t=mot-foarfeca');
  await host.page.click('#publish');
  await expect(host.page.locator('#eventLink')).toHaveValue(/\/ro\/e\/[A-Za-z0-9_-]{22}$/);
  const invitation = await host.page.locator('#eventLink').inputValue();

  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  await expect(guest.page.locator('h1')).toHaveText('Moțul Sofiei');
  await guest.page.fill('#guestName', 'Ioana');
  await guest.page.fill('#partySize', '3');
  await guest.page.click('#sendReply');
  await expect(guest.page.locator('#replyOutcome')).toHaveText('Răspuns trimis');
  expect([...host.problems, ...guest.problems]).toEqual([]);
});
