// The sections of the tracker, the host's page for one published invitation, in page order. A section is
// {id, modes, init?, show?}. id names its <section> element in manage.html and ro/manage.html, and modes lists the
// invitation modes that show it; manage.js hides it in the other modes. init(page) binds its controls once, and
// show(view, page) fills it after each load. view is the management read {t, d, version, responses, totals} with the
// invitation data as invite and its mode as mode. page is {lang, locale, copy, client, cred, signedIn, setStatus,
// showOnly, load}, where signedIn is true when cred holds a passkey access token instead of the management secret, setStatus(text) writes the page status, showOnly(heading, message) replaces the page with a message,
// and load() reloads the view. A new feature adds its module, one entry here and its element in both pages.
// tests/check-site.js fails when an entry and the elements disagree.
import { section as rsvpDeadline } from './deadline.js';
import { section as deleteInvitation } from './delete.js';
import { section as guestList } from './guest-list.js';
import { section as invitationLink } from './invitation-link.js';
import { section as passkey } from './passkey.js';
import { section as reminders } from './reminders.js';
import { section as replies } from './replies.js';
import { section as seating } from './seating.js';
import { section as switchMode } from './switch-mode.js';
import { section as partyUpdate } from './update.js';

/** @type {{id: string, modes: string[], init?: (page: any) => void, show?: (view: any, page: any) => void | Promise<void>}[]} */
export const SECTIONS = [
  replies,
  switchMode,
  guestList,
  reminders,
  rsvpDeadline,
  seating,
  partyUpdate,
  invitationLink,
  passkey,
  deleteInvitation,
];
