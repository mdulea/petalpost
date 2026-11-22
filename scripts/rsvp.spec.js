// Fails when publishing, guest replies or the management page break in Chromium against the real API of
// scripts/server.js. Checks: an invitation published in one browser opens in another; a guest's reply, its edit
// link and an edit that keeps one reply; the management totals and reply list; the invitation link and a guessed
// secret cannot open the management page; one guest's edit link cannot load another's reply; a failed reply shows
// the failure and no confirmation, and its retry saves one reply; a reply whose confirmation is lost loads again
// after a reload and its resend keeps one reply; a reply changed elsewhere loads the latest answer;
// publishing again updates the invitation, and a stale tab hears of the change; a tab opened before the first
// publish publishes to the same invitation; deletion shows guests a missing message and lets the host publish
// anew; a lost publish confirmation keeps the event identity; secrets appear only in the Authorization header;
// analytics gets page addresses without the fragment; the report link of a published invitation names the invitation link and never a guest's edit secret; no page breaks the Content-Security-Policy or throws.
// Each test uses its own browser contexts for the host and every guest, so no test shares storage with another.
// Run: pnpm test:browser
import { expect, test } from '@playwright/test';

// Policy violations and uncaught errors. The Vercel analytics script only exists in production, so its 404 is not one.
function watch(page) {
  const problems = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

// A page in a browser context of its own, as on another device.
async function newBrowser(browser) {
  const page = await (await browser.newContext()).newPage();
  return { page, problems: watch(page) };
}

// Publishes a birthday invitation with the title and returns the links the editor shows.
async function publish(page, title) {
  await page.goto('editor.html?t=birthday');
  await page.fill('#title', title);
  await page.click('#publish');
  await expect(page.locator('#eventLink')).toHaveValue(/\?view=1&e=/);
  return {
    invitation: await page.locator('#eventLink').inputValue(),
    manage: await page.locator('#manageLink').inputValue(),
  };
}

test('an invitation published in one browser opens in another', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation } = await publish(host.page, 'Zoe turns 30');
  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  await expect(guest.page.locator('h1')).toHaveText('Zoe turns 30');
  await expect(guest.page.locator('#previewCard .invite-title')).toHaveText('Zoe turns 30');
  expect([...host.problems, ...guest.problems]).toEqual([]);
});

// Fills and sends the reply form on an opened invitation and waits for the saved confirmation.
async function reply(page, { name, attending = true, partySize = 1 }) {
  await page.fill('#guestName', name);
  await page.check(`input[name="attending"][value="${attending ? 'yes' : 'no'}"]`);
  if (attending) await page.fill('#partySize', String(partySize));
  await page.click('#sendReply');
  await expect(page.locator('#rsvpStatus')).toHaveText('Your reply is saved. The host can see it now.');
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
  await reply(samLater.page, { name: 'Sam Lee', partySize: 3 });
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

test('the invitation link and a guessed secret cannot open the management page', async ({ browser }) => {
  const host = await newBrowser(browser);
  const { invitation, manage } = await publish(host.page, 'Zoe turns 30');
  const sam = await newBrowser(browser);
  await sam.page.goto(invitation);
  await reply(sam.page, { name: 'Sam' });
  const eventId = new URL(invitation).searchParams.get('e');
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
  await sam.page.click('#sendReply');
  await expect(sam.page.locator('#rsvpStatus')).toHaveText('Your reply is saved. The host can see it now.');
  await sam.page.click('#sendReply');
  await expect(sam.page.locator('#rsvpStatus')).toHaveText('Your reply is saved. The host can see it now.');
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
  await reply(sam.page, { name: 'Sam Lee' });
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
  await reply(samPhone.page, { name: 'Sam from the phone', partySize: 4 });

  await sam.page.fill('#guestName', 'Sam from the laptop');
  await sam.page.click('#sendReply');
  await expect(sam.page.locator('#rsvpStatus')).toHaveText(
    'This reply changed in another browser. The latest answer is shown.',
  );
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
  await expect(host.page.locator('#publishStatus')).toHaveText(
    'Published. Guests see the changes when they open the invitation link.',
  );
  await staleTab.click('#publish');
  await expect(staleTab.locator('#publishStatus')).toHaveText(
    'This invitation changed in another browser since you last published. Publishing again replaces those changes.',
  );
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
  await expect(earlyTab.locator('#eventLink')).toHaveValue(/\?view=1&e=/);
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
  await expect(host.page.locator('#publishStatus')).toHaveText('Published. Send the invitation link to your guests.');
  const id = new URL(await host.page.locator('#eventLink').inputValue()).searchParams.get('e');
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

test('Romanian publishing, guest RSVP and management keep links and copy in Romanian', async ({ browser }) => {
  const host = await newBrowser(browser);
  await host.page.goto('/ro/editor.html?t=botez-porumbel');
  await host.page.fill('#title', 'Botezul lui Matei');
  await host.page.click('#publish');
  await expect(host.page.locator('#eventLink')).toHaveValue(/\/ro\/editor\.html\?view=1&e=/);
  await expect(host.page.locator('#manageLink')).toHaveValue(/\/ro\/manage\.html#/);
  const invitation = await host.page.locator('#eventLink').inputValue();
  const manage = await host.page.locator('#manageLink').inputValue();

  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  await expect(guest.page.locator('h1')).toHaveText('Botezul lui Matei');
  await guest.page.fill('#guestName', 'Andrei');
  await guest.page.fill('#partySize', '2');
  await guest.page.click('#sendReply');
  await expect(guest.page.locator('#rsvpStatus')).toHaveText('Răspunsul tău a fost salvat. Gazda îl poate vedea acum.');

  await host.page.goto(manage);
  expect(await managed(host.page)).toEqual({
    totals: expect.stringMatching(/1\s+răspuns[\s\S]*1\s+confirmare[\s\S]*0\s+refuzuri[\s\S]*2\s+persoane confirmate/i),
    replies: [expect.stringMatching(/Andrei[\s\S]*Da, 2 persoane/)],
  });

  const stranger = await newBrowser(browser);
  await stranger.page.goto(manage.replace(/\.[^.]+$/, `.${'x'.repeat(43)}`));
  await expect(stranger.page.locator('#manageStatus')).toHaveText('Acest link nu oferă acces la această invitație.');
  expect([...host.problems, ...guest.problems, ...stranger.problems]).toEqual([]);
});
