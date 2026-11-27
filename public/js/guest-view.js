// Guest view mode for editor.html and ro/editor.html (published invitation links, personal links, view links,
// share links, and sample links). Runs without initializing the host editor or rendering the template gallery.
import { createClient, createCounter } from './api-client.js';
import { countdown, eventStart } from './countdown.js';
import {
  RISE,
  canShareLink,
  copyLink,
  createStatus,
  openPanel,
  renderInviteCard,
  setOutcome,
  shareLinkNative,
  showOutcome,
} from './editor-shared.js';
import { classifyGuestLink, resolveGuestLoad, shouldReloadOnHashChange } from './guest-route.js';
import { UI } from './i18n.js';
import {
  buildIcs,
  eventLink,
  makeInviteData,
  mapLink,
  menuLabels,
  reportLink,
  slug,
  subEventLabels,
} from './invite.js';
import { animate } from './motion.js';
import { showPersonalSections } from './personal/sections.js';
import { createReplyFields } from './reply-fields.js';
import { REPLY_LIMITS, newId, newSecret, responseLink, viewLink, viewLinkSecret } from './rsvp.js';
import { getTemplate } from './templates.js';

export function initGuestView({ state, lang, locale }) {
  const editorCopy = UI[lang].editor;
  const guestCopy = UI[lang].guest;
  const personalCopy = UI[lang].personal;

  const previewCard = document.getElementById('previewCard');
  const setStatus = createStatus(document.getElementById('status'));
  const client = createClient(fetch, { lang });
  const countAction = createCounter((url, data) => navigator.sendBeacon(url, data), lang);

  document.body.classList.add('view-mode');
  document.body.classList.toggle('invite-hidden', state.broken || Boolean(state.event));

  function render() {
    renderInviteCard(previewCard, state, lang, locale);
    const map = /** @type {HTMLAnchorElement} */ (document.getElementById('openMap'));
    const mapUrl = mapLink(state.d);
    map.hidden = !mapUrl;
    if (mapUrl) map.href = mapUrl;
  }

  function revealInvite() {
    animate([previewCard], RISE, { duration: 400, easing: 'ease-out' });
  }

  function setHeading(heading) {
    document.title = `${heading} | Petalpost`;
    document.querySelector('.editor-head h1').textContent = heading;
  }

  const countdownEl = document.getElementById('countdown');
  /** @type {ReturnType<typeof setInterval>} */
  let countdownTimer;
  function showCountdown() {
    const start = eventStart(state.d);
    const refresh = () => {
      const left = countdown(start, new Date());
      countdownEl.hidden = !left;
      if (left) countdownEl.textContent = guestCopy.countdown(left);
      else clearInterval(countdownTimer);
    };
    clearInterval(countdownTimer);
    refresh();
    if (!countdownEl.hidden) countdownTimer = setInterval(refresh, 60 * 1000);
  }

  // Calendar file built from the invite fields.
  document.getElementById('addCalendar').addEventListener('click', () => {
    const ics = buildIcs(state.d, new Date());
    if (!ics) {
      setStatus(editorCopy.noDate);
      return;
    }
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    link.download = `${slug(state.d.title)}.ics`;
    link.click();
    // Only guests of a published invitation count. The sample invitation and the host's preview send nothing.
    if (state.event) countAction('calendar_add');
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  // Open-mode reply form controls (prepared only when an open-mode or sample form is shown).
  const rsvpForm = /** @type {HTMLFormElement} */ (document.getElementById('rsvpForm'));
  const rsvpStatus = document.getElementById('rsvpStatus');
  const replyLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('replyLink'));
  const sendReply = /** @type {HTMLButtonElement} */ (document.getElementById('sendReply'));
  const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('guestName'));
  const partySizeInput = /** @type {HTMLInputElement} */ (document.getElementById('partySize'));
  const noteInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('guestNote'));
  const attendingField = /** @type {HTMLElement} */ (rsvpForm.querySelector('[role="radiogroup"]'));
  const withdrawButton = /** @type {HTMLButtonElement} */ (document.getElementById('withdrawReply'));
  const replySavedPanel = document.getElementById('replySaved');
  const withdrawnPanel = document.getElementById('replyWithdrawn');

  const limitAlert = document.createElement('p');
  limitAlert.className = 'visually-hidden';
  limitAlert.id = 'limitAlert';
  limitAlert.setAttribute('role', 'status');
  document.body.append(limitAlert);

  /** @type {ReturnType<typeof createReplyFields> | null} */
  let openReplyFields = null;

  function setupOpenReplyForm(initialCred) {
    const replyCred = { ...(initialCred ?? { id: newId(), secret: newSecret() }), version: null };
    openReplyFields = createReplyFields({
      lang,
      limit: REPLY_LIMITS.partySize,
      subEvents: subEventLabels(state.d, lang),
      menu: menuLabels(state.d, lang),
      prefix: 'open',
      answerPrefix: 'answer',
      mealPrefix: 'meals',
      existing: { form: rsvpForm, nameInput, attendingField, partySizeInput, noteInput },
      inlineErrors: true,
      liveRegion: limitAlert,
    });
    openReplyFields.fill(null, 1);

    const replyLink = () => responseLink(location.origin, state.event, replyCred.id, replyCred.secret, lang);
    const showReplyLink = () => {
      replyLinkInput.value = replyLink();
      replySavedPanel.hidden = false;
    };

    rsvpForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const { reply, invalid } = openReplyFields.validate();
      openReplyFields.showErrors(invalid);
      setOutcome(replySavedPanel, null);
      if (!reply) {
        rsvpStatus.textContent = '';
        return;
      }
      if (state.sample) {
        rsvpStatus.textContent = guestCopy.sampleReply;
        return;
      }
      history.replaceState(null, '', replyLink());
      sendReply.disabled = true;
      rsvpStatus.textContent = guestCopy.sendingReply;
      const created = replyCred.version === null;
      const result = await client.saveReply(state.event, replyCred, reply);
      sendReply.disabled = false;
      if (result.ok) {
        replyCred.version = result.data.version;
        showReplyLink();
        rsvpStatus.textContent = '';
        showOutcome(replySavedPanel, created ? guestCopy.replySent : guestCopy.replyUpdated);
        return;
      }
      if (result.status === 409) {
        replyCred.version = result.data.version;
        openReplyFields.fill(result.data, 1);
      }
      rsvpStatus.textContent = result.message;
    });

    withdrawButton.addEventListener('click', async () => {
      if (!window.confirm(guestCopy.withdrawConfirm)) return;
      withdrawButton.disabled = true;
      setOutcome(replySavedPanel, null);
      rsvpStatus.textContent = guestCopy.withdrawingReply;
      const result = await client.withdrawReply(state.event, replyCred);
      withdrawButton.disabled = false;
      if (result.ok) {
        Object.assign(replyCred, { id: newId(), secret: newSecret(), version: null });
        history.replaceState(null, '', eventLink(location.origin, state.event, lang));
        rsvpForm.reset();
        openReplyFields.fill(null, 1);
        replySavedPanel.hidden = true;
        rsvpStatus.textContent = '';
        rsvpForm.hidden = true;
        openPanel(withdrawnPanel);
        return;
      }
      if (result.status === 409) {
        replyCred.version = result.data.version;
        openReplyFields.fill(result.data, 1);
      }
      rsvpStatus.textContent = result.message;
    });

    document.getElementById('replyAgain').addEventListener('click', () => {
      withdrawnPanel.hidden = true;
      rsvpForm.hidden = false;
      openReplyFields.focusName();
    });

    document.getElementById('copyReplyLink').addEventListener('click', () =>
      copyLink(replyLinkInput.value, editorCopy.copyPrompt, () => {
        rsvpStatus.textContent = guestCopy.replyLinkCopied;
      }),
    );

    return { replyCred, showReplyLink };
  }

  const headingFor = (kind) =>
    kind === 'ended'
      ? guestCopy.endedHeading
      : kind === 'missing'
        ? guestCopy.missingHeading
        : guestCopy.loadFailedHeading;

  async function openEvent(route) {
    const unavailable = (message, heading = guestCopy.loadFailedHeading) => {
      setHeading(heading);
      setStatus(message, { keep: true });
      document.body.classList.add('invite-hidden');
      for (const id of ['personalSections', 'countdown', 'replyCta', 'reportRow']) {
        document.getElementById(id).hidden = true;
      }
      clearInterval(countdownTimer);
    };

    if (route.kind === 'malformedParty') {
      unavailable(personalCopy.unavailable);
      return;
    }

    const result =
      route.kind === 'view'
        ? await client.loadPartyView(route.eventId, route.credential)
        : route.kind === 'personal'
          ? await client.loadParty(route.eventId, route.credential)
          : await client.loadEvent(route.eventId);

    const resolved = resolveGuestLoad(route, result);
    if (resolved.kind === 'unavailable') {
      unavailable(resolved.message, headingFor(resolved.heading));
      return;
    }
    if (resolved.kind === 'error') {
      setHeading(headingFor(resolved.heading));
      setStatus(resolved.message, { keep: true });
      return;
    }

    const template = getTemplate(resolved.data.t, lang);
    state.t = template.id;
    state.d = makeInviteData(template, resolved.data.d, lang);
    setHeading(state.d.title || guestCopy.defaultGuestHeading);
    document.body.classList.remove('invite-hidden');
    render();
    revealInvite();
    showCountdown();
    /** @type {HTMLAnchorElement} */ (document.getElementById('reportLink')).href = reportLink(
      eventLink(location.origin, state.event, lang),
      lang,
    );
    document.getElementById('replyCta').hidden = false;
    document.getElementById('reportRow').hidden = false;

    if (resolved.kind === 'view' || resolved.kind === 'personal') {
      const page = {
        client,
        eventId: state.event,
        credential: route.credential,
        copy: personalCopy,
        guestCopy,
        lang,
        locale,
        unavailable,
      };
      if (resolved.kind === 'personal') {
        // Compute the guest's view link lazily only when they ask to share it.
        let cachedViewUrl = null;
        page.shareView = async () => {
          cachedViewUrl ??= viewLink(
            eventLink(location.origin, state.event, lang),
            route.credential.id,
            await viewLinkSecret(route.credential.secret, route.credential.id),
          );
          const copied = () => setStatus(personalCopy.viewCopied);
          if (canShareLink) {
            return shareLinkNative(
              state,
              lang,
              editorCopy.copyPrompt,
              cachedViewUrl,
              () => setStatus(personalCopy.viewShared),
              copied,
            );
          }
          return copyLink(cachedViewUrl, editorCopy.copyPrompt, copied);
        };
      }
      showPersonalSections(resolved.data, page, resolved.kind === 'view');
      return;
    }

    if (resolved.kind === 'guestListPublic') {
      rsvpForm.hidden = true;
      const guestListNotice = document.getElementById('guestListNotice');
      guestListNotice.hidden = false;
      if (resolved.showReplyLinkUnavailable) guestListNotice.textContent = guestCopy.replyLinkUnavailable;
      return;
    }

    const { replyCred, showReplyLink } = setupOpenReplyForm(resolved.loadReplyCredential);
    rsvpForm.hidden = false;
    document.getElementById('guestListNotice').hidden = true;
    if (!resolved.loadReplyCredential) return;
    const saved = await client.loadReply(state.event, replyCred);
    if (saved.status === 404) {
      rsvpStatus.textContent = guestCopy.noSavedReply;
      return;
    }
    if (!saved.ok) {
      rsvpStatus.textContent = saved.message;
      return;
    }
    replyCred.version = saved.data.version;
    openReplyFields.fill(saved.data, 1);
    showReplyLink();
    rsvpStatus.textContent = guestCopy.savedReplyShown;
  }

  if (state.broken) {
    setHeading(guestCopy.brokenHeading);
    setStatus(guestCopy.brokenMessage, { keep: true });
    return;
  }

  if (state.event) {
    const route = classifyGuestLink({ eventId: state.event, hash: location.hash });
    setHeading(guestCopy.openingHeading);
    openEvent(route);
    window.addEventListener('hashchange', () => {
      if (shouldReloadOnHashChange(route, location.hash)) location.reload();
    });
    return;
  }

  if (state.sample) {
    setHeading(state.d.title || guestCopy.defaultGuestHeading);
    const sampleNotice = document.getElementById('sampleNotice');
    sampleNotice.textContent = guestCopy.sampleNotice;
    sampleNotice.hidden = false;
    setupOpenReplyForm(null);
    rsvpForm.hidden = false;
    render();
    revealInvite();
    showCountdown();
    return;
  }

  // Legacy #d= share link.
  setHeading(state.d.title || guestCopy.defaultGuestHeading);
  render();
  revealInvite();
  showCountdown();
}
