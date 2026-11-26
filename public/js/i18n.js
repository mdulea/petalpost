// Locale metadata, route pairings and UI copy shared by browser modules, static page generation and the RSVP API.
// No DOM access, so Node scripts and server/api.js import it directly; tests/check-dom-free.js enforces it.

export const LANGS = ['en', 'ro'];

const roPlural = new Intl.PluralRules('ro-RO');
// A Romanian count with its noun. one is the phrase for 1 and many the plural noun, as in "o zi", "3 zile" and
// "20 de zile". Counts in the plural category other, such as 20 and 120, take "de".
const roCount = (count, [one, many]) =>
  ({ one, few: `${count} ${many}` })[roPlural.select(count)] ?? `${count} de ${many}`;
// The time left in a result of countdown() in countdown.js, as in "3 days" and "3 zile".
const enLeft = ({ unit, count }) => `${count} ${unit === 'days' ? 'day' : 'hour'}${count === 1 ? '' : 's'}`;
const roLeft = ({ unit, count }) => roCount(count, unit === 'days' ? ['o zi', 'zile'] : ['o oră', 'ore']);

/** @param {string} [lang] */
export const normalizeLang = (lang) => (typeof lang === 'string' && lang.toLowerCase().startsWith('ro') ? 'ro' : 'en');

/** @param {string} [lang] */
export const localeOf = (lang) => (normalizeLang(lang) === 'ro' ? 'ro-RO' : 'en-US');

// Every English and Romanian page and its reciprocal alternate. Occasions and guides unique to Romanian have en: null.
// guide: true marks the hand-written guides.
export const ROUTE_PAIRS = [
  { key: 'home', en: 'index.html', ro: 'ro/index.html', indexed: true },
  { key: 'editor', en: 'editor.html', ro: 'ro/editor.html', indexed: true },
  { key: 'manage', en: 'manage.html', ro: 'ro/manage.html', indexed: false },
  { key: 'birthday', en: 'birthday-invitations.html', ro: 'ro/invitatii-zi-de-nastere.html', indexed: true },
  { key: 'wedding', en: 'wedding-invitations.html', ro: 'ro/invitatii-nunta.html', indexed: true },
  { key: 'baby-shower', en: 'baby-shower-invitations.html', ro: 'ro/invitatii-baby-shower.html', indexed: true },
  { key: 'brunch', en: 'brunch-invitations.html', ro: 'ro/invitatii-brunch.html', indexed: true },
  { key: 'graduation', en: 'graduation-invitations.html', ro: 'ro/invitatii-absolvire.html', indexed: true },
  { key: 'housewarming', en: 'housewarming-invitations.html', ro: 'ro/invitatii-casa-noua.html', indexed: true },
  { key: 'botez', en: null, ro: 'ro/invitatii-botez.html', indexed: true },
  { key: 'cununie', en: null, ro: 'ro/invitatii-cununie.html', indexed: true },
  { key: 'mot', en: null, ro: 'ro/invitatii-mot.html', indexed: true },
  { key: 'wording', en: 'invitation-wording.html', ro: 'ro/text-invitatii.html', indexed: true, guide: true },
  {
    key: 'when-to-send',
    en: 'when-to-send-invitations.html',
    ro: 'ro/cand-sa-trimiti-invitatiile.html',
    indexed: true,
    guide: true,
  },
  { key: 'digital-or-printed', en: null, ro: 'ro/invitatii-digitale-sau-tiparite.html', indexed: true, guide: true },
  { key: 'about', en: 'about.html', ro: 'ro/despre.html', indexed: true },
  { key: 'privacy', en: 'privacy.html', ro: 'ro/confidentialitate.html', indexed: true },
  { key: 'terms', en: 'terms.html', ro: 'ro/termeni.html', indexed: true },
];

/** @param {string} file */
export const canonicalPath = (file) => {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'index.html'.length)}`;
  return `/${file}`;
};

/** @param {string} file */
export const fileLang = (file) => (file.startsWith('ro/') ? 'ro' : 'en');

/** @param {string} file */
export const routeForFile = (file) => ROUTE_PAIRS.find((pair) => pair.en === file || pair.ro === file) || null;

// Alternate links for <head>. Paired indexed pages emit en, ro and x-default (en); RO-only pages emit self ro only.
/**
 * @param {string} file
 * @param {string} origin
 */
export function alternatesFor(file, origin) {
  const pair = routeForFile(file);
  if (!pair || !pair.indexed) return [];
  if (pair.en && pair.ro) {
    const enUrl = `${origin}${canonicalPath(pair.en)}`;
    const roUrl = `${origin}${canonicalPath(pair.ro)}`;
    return [
      { hreflang: 'en', href: enUrl },
      { hreflang: 'ro', href: roUrl },
      { hreflang: 'x-default', href: enUrl },
    ];
  }
  const lang = pair.ro ? 'ro' : 'en';
  const target = pair.ro || pair.en;
  return [{ hreflang: lang, href: `${origin}${canonicalPath(target)}` }];
}

// Target path for the opposite-language switcher button on any page.
/** @param {string} file */
export function languageSwitchHref(file) {
  const lang = fileLang(file);
  const other = lang === 'ro' ? 'en' : 'ro';
  const pair = routeForFile(file);
  if (pair?.[other]) return canonicalPath(pair[other]);
  return other === 'ro' ? '/ro/' : '/';
}

// Path the Romanian language banner opens, or null when the banner stays hidden. It shows on an English page whose
// head has a Romanian alternate, to a browser that lists Romanian among its preferred languages, until the visitor
// closes it. alternate is that link's absolute href or null; the path keeps the link on the current origin.
/** @param {{ lang: string, languages: readonly string[], alternate: string | null, closed: boolean }} page */
export function romanianBannerHref({ lang, languages, alternate, closed }) {
  if (lang !== 'en' || !alternate || closed || !languages.some((l) => normalizeLang(l) === 'ro')) return null;
  return new URL(alternate).pathname;
}

export const CATEGORY_LABELS = {
  en: {
    Birthday: 'Birthday',
    Wedding: 'Wedding',
    'Baby shower': 'Baby shower',
    Brunch: 'Brunch',
    Graduation: 'Graduation',
    Housewarming: 'Housewarming',
  },
  ro: {
    Wedding: 'Nuntă',
    Cununie: 'Cununie',
    Botez: 'Botez',
    Moț: 'Moț',
    Birthday: 'Zi de naștere',
    Housewarming: 'Casă nouă',
    Graduation: 'Absolvire',
    'Baby shower': 'Baby shower',
    Brunch: 'Brunch',
  },
};

/**
 * @param {string} category
 * @param {string} [lang]
 */
export const categoryLabel = (category, lang = 'en') => CATEGORY_LABELS[normalizeLang(lang)][category] ?? category;

export const ACCENT_LABELS = {
  en: {
    '#A44E47': 'Rose',
    '#52704C': 'Sage',
    '#4F6993': 'Dusk blue',
    '#8A5F18': 'Honey',
    '#7A5A9A': 'Lilac',
    '#2F3D35': 'Evergreen',
  },
  ro: {
    '#A44E47': 'Trandafiriu',
    '#52704C': 'Salvie',
    '#4F6993': 'Albastru ardezie',
    '#8A5F18': 'Miere',
    '#7A5A9A': 'Liliac',
    '#2F3D35': 'Verde brad',
  },
};

/**
 * @param {string} hex
 * @param {string} [lang]
 */
export const accentLabel = (hex, lang = 'en') => ACCENT_LABELS[normalizeLang(lang)][hex] ?? hex;

// Strings that scripts write into pages, one group per feature in each language. Both languages have the same keys.
export const UI = {
  en: {
    landing: {
      all: 'All',
      useTemplate: (name) => `Use the ${name} template`,
    },
    editor: {
      defaultSwatch: 'Template default',
      charsLeft: (n) => `${n} left`,
      chooseImage: 'Choose an image file, such as JPG, PNG or HEIC exported to JPG.',
      imageRefused: 'That image could not be read. Try a JPG or PNG.',
      photoAdded:
        'Photo added. It stays in this browser, so the invitation link shows the illustration. To send the photo, download the PNG.',
      photoTooLarge:
        'Photo added, but it is too large to keep after a reload. The invitation link shows the illustration, so download the PNG to send the photo.',
      resetConfirm: 'Replace all your text with the template sample?',
      resetDone: 'Text reset to the template sample.',
      copyPrompt: 'Copy this link:',
      imageToolLoading: 'The image tool is still loading. Try again in a moment.',
      preparingImage: 'Preparing the image.',
      downloaded: 'Invite downloaded.',
      inviteShared: 'Invite shared.',
      downloadFailed: 'The download failed. Try again, or take a screenshot of the preview.',
      noDate: 'This invite has no valid date yet.',
      guestListDate: 'Add an event date before publishing a guest-list invitation.',
      publish: 'Publish',
      publishChanges: 'Publish changes',
      publishing: 'Publishing.',
      publishedHeading: 'Invitation published',
      changesPublishedHeading: 'Changes published',
      storageRefused: 'This browser cannot keep the invitation, so save the management link now.',
      deletedOnServer: 'This invitation was deleted with its replies. Publish again to make a new invitation link.',
      eventLinkCopied: 'Invitation link copied. Paste it into a message to your guests.',
      eventLinkShared: 'Invitation link shared.',
      manageLinkCopied: 'Management link copied. Keep it somewhere private.',
    },
    // The guest view of a published invitation and its reply form.
    guest: {
      // The argument is a result of countdown() in countdown.js.
      countdown: ({ unit, count }) => `Starts in ${count} ${unit === 'days' ? 'day' : 'hour'}${count === 1 ? '' : 's'}`,
      replyErrors: (limits) => ({
        name: 'Enter your name.',
        attending: 'Choose whether you will attend.',
        partySize: `Enter a number from 1 to ${limits.partySize}.`,
        note: `Use at most ${limits.note} characters.`,
      }),
      sampleReply:
        'Sample reply checked locally. Nothing was sent. Use Make your own to collect real replies and track headcount.',
      sendingReply: 'Sending your reply.',
      replySent: 'Reply sent',
      replyUpdated: 'Reply updated',
      replyLinkCopied: 'Edit link copied. Keep it to change your reply later.',
      missingHeading: 'This invitation does not exist',
      endedHeading: 'This invitation has ended',
      loadFailedHeading: 'The invitation could not be loaded',
      defaultGuestHeading: 'You are invited',
      savedReplyShown: 'Your saved reply is shown. Change it and send it again.',
      noSavedReply: 'No reply is saved under this link yet. Send the form to save one.',
      withdrawConfirm: 'Withdraw your reply? The host will no longer see it.',
      withdrawingReply: 'Withdrawing your reply.',
      brokenHeading: 'This invite link is incomplete',
      brokenMessage: 'This invite link is incomplete. Ask the host to send the whole link again.',
      openingHeading: 'Opening the invitation',
      sampleNotice: 'Sample invitation. Replies submitted here are not saved.',
      replyLinkUnavailable:
        'This link no longer works. Use the personal link the host sent you to view or change your reply.',
    },
    personal: {
      greeting: (name) => `Hello, ${name}!`,
      reminder: 'Please let us know if you can come.',
      updateHeading: 'Update from the host',
      unavailable: 'This link no longer works. Ask the host for a new one.',
      noReply: 'No reply yet',
      showFriend: 'Show a friend',
      viewShared: 'View link shared.',
      viewCopied: 'View link copied.',
      heading: 'Reply to the host',
      attending: 'Will you come?',
      yes: 'Yes, I will come',
      no: 'No, I cannot come',
      seats: 'People in your party, you included',
      note: 'Note (optional)',
      noteHint: 'Dietary needs or a message. Visible only to the host.',
      send: 'Send reply',
      withdraw: 'Withdraw my reply',
      withdrawn: 'Reply withdrawn',
    },
    seating: {
      add: 'Add table',
      name: 'Table name or number',
      capacity: 'Capacity',
      save: 'Save table',
      remove: 'Remove table',
      removeConfirm: 'Remove this table? Its parties will be unassigned.',
      picker: 'Move to table',
      unassigned: 'Unassigned',
      move: 'Move party',
      seats: (filled, free) => `${filled} filled, ${free} free`,
      over: (seats) => `Over capacity by ${seats}`,
      partySeats: (seats) => `${seats} ${seats === 1 ? 'seat' : 'seats'}`,
      declined: 'Declined',
    },
    guestList: {
      invalidName: (max) => `Enter a name of up to ${max} characters on each line.`,
      csvColumns: ['Name', 'Status', 'Seats', 'Attending', 'Note'],
      csvFile: 'petalpost-guest-list',
      replied: 'Replied',
      limit: (max) => `The guest list can have up to ${max} parties.`,
      rename: 'Rename',
      renamePrompt: 'Enter the new party name.',
      renameInvalid: (max) => `Enter a party name of 1 to ${max} characters.`,
      delete: 'Delete party',
      confirmDelete: (name) => `Delete "${name}" and its reply?`,
      partial: 'Some parties were added. The remaining names are still in the form.',
      retryPaste: 'Try adding again with the same names and seats, or reload to check which parties were added.',
      acceptedSeats: (n) => (n === 1 ? 'accepted seat' : 'accepted seats'),
      declinedParties: (n) => (n === 1 ? 'declined party' : 'declined parties'),
      pendingParties: (n) => (n === 1 ? 'party without a reply' : 'parties without a reply'),
      defaultSeats: (n) => `Default seats: ${n}`,
      language: { en: 'English', ro: 'Romanian' },
      answer: (yes, n) => `Replied. ${yes ? 'Yes' : 'No'}, ${n} ${n === 1 ? 'person' : 'people'}.`,
      overBy: (n) => `Over by ${n}`,
      noReply: 'No reply yet',
      notOpened: 'Not opened',
      opened: 'Opened',
      firstOpened: (time) => `First opened ${time}`,
      lastOpened: (time) => `Last opened ${time}`,
      seatsLabel: 'Reply seats',
      saveSeats: 'Save seats',
      seatsSaved: 'Seats updated.',
      link: 'Personal link',
      copy: 'Copy message',
      copied: 'Message copied.',
      copyPrompt: 'Copy this message:',
      whatsapp: 'Send on WhatsApp',
      remind: 'Remind on WhatsApp',
      reminderUsed: 'WhatsApp opened',
      revoke: 'Revoke personal link',
      regenerate: 'Regenerate personal link',
      revokeConfirm: 'Revoke this personal link? It will stop working.',
      regenerateConfirm: 'Generate a new personal link? Any earlier link will stop working.',
      revoked: 'Personal link revoked.',
      regenerated: 'Personal link regenerated.',
      preview: 'Preview as this guest',
      editReply: 'Edit reply',
      saveReply: 'Save reply',
      cancel: 'Cancel',
      replySaved: 'Reply saved.',
      attending: 'Will they come?',
      yes: 'Yes',
      no: 'No',
      seats: 'People attending',
      note: 'Note',
      switchConfirm:
        'Switch this invitation to the guest-list mode? Your invitation link and earlier replies stay, and the public link stops taking new replies.',
      attachTo: 'Attach to party',
      attach: 'Attach',
      attached: 'Reply attached to party.',
      noPartyToAttach: 'Add a party without a reply to attach this reply.',
    },
    deadline: {
      none: 'No RSVP deadline is set. Replies stay open until the invitation ends.',
      open: (date) => `Replies close on ${date} at 23:59 Europe/Bucharest time.`,
      closed: (date) => `Replies are closed. The RSVP deadline passed on ${date}.`,
      guestOpen: (date) => `Please reply by ${date}.`,
      saved: 'RSVP deadline saved.',
      cleared: 'RSVP deadline cleared. Replies are open.',
    },
    partyUpdate: {
      invalid: (max) => `Enter an update of 1 to ${max} characters.`,
      saved: 'Update saved.',
      removed: 'Update removed.',
      removeConfirm: 'Remove the update from every personal link and view link?',
    },
    // The countdowns to the RSVP deadline and the deletion of a guest list, and the tracker's nudges. A left argument
    // is a result of countdown() in countdown.js.
    countdowns: {
      deadline: (left) => `Replies close in ${enLeft(left)}.`,
      pending: (n) => `${n} ${n === 1 ? 'party has' : 'parties have'} not replied.`,
      deletion: (left) => `The guest list and its replies are deleted in ${enLeft(left)}.`,
      deletionDue: 'The guest list and its replies are deleted within a day.',
      download: 'Download the guest-list CSV to keep a copy.',
    },
    invite: {
      photoAlt: 'Event photo',
    },
    manage: {
      defaultHeading: 'Your invitation',
      replyOne: 'reply',
      replyMany: 'replies',
      yesOne: 'yes',
      yesMany: 'yes',
      noOne: 'no',
      noMany: 'no',
      attendingOne: 'person attending',
      attendingMany: 'people attending',
      personOne: 'person',
      personMany: 'people',
      yesCount: (n) => `Yes, ${n} ${n === 1 ? 'person' : 'people'}`,
      no: 'No',
      replied: 'Replied',
      changed: 'Changed',
      loading: 'Loading the replies.',
      missingHeading: 'This invitation does not exist',
      endedHeading: 'This invitation has ended',
      loadFailedHeading: 'The invitation could not be loaded',
      eventLinkCopied: 'Invitation link copied. Paste it into a message to your guests.',
      copyPrompt: 'Copy this link:',
      deleteConfirm: 'Delete this invitation and all its replies? This cannot be undone.',
      deletedHeading: 'Invitation deleted',
      deletedMessage: 'The invitation and all its replies are deleted from Petalpost.',
      incompleteHeading: 'This management link is incomplete',
      incompleteMessage: 'This management link is incomplete. Open the whole link from where you saved it.',
    },
    passkey: {
      saved:
        'Passkey saved. On another device with the same Apple, Google or Microsoft account, use "Find my invitations" on the home page.',
      cancelled: 'The passkey request was cancelled or timed out.',
      failed: 'This browser could not use a passkey. Try another browser or device.',
      opening: 'Opening your invitation.',
    },
    // Excel in English uses a comma between values.
    csv: {
      separator: ',',
      columns: ['Name', 'Attending', 'Party size', 'Note', 'Replied', 'Changed'],
      yes: 'Yes',
      no: 'No',
      file: 'petalpost-replies',
    },
    rsvp: {
      offline: 'Petalpost could not be reached. Check your connection and try again.',
      unexpected: 'Something went wrong on the server. Try again in a minute.',
    },
    report: {
      subject: 'Report of an invitation',
      body: (url) =>
        [
          `Invitation: ${url}`,
          '',
          'Why this content is illegal, with the law or rule it breaks:',
          '',
          '',
          'Your name:',
          'Your email address:',
          '',
          'I am reporting this in good faith and believe that the information above is accurate and complete.',
        ].join('\n'),
    },
  },
  ro: {
    landing: {
      all: 'Toate',
      useTemplate: (name) => `Folosește modelul ${name}`,
    },
    editor: {
      defaultSwatch: 'Culoarea modelului',
      charsLeft: (n) => (n === 1 ? 'Mai rămâne 1' : `Mai rămân ${n}`),
      chooseImage: 'Alege un fișier imagine, precum JPG, PNG sau HEIC exportat ca JPG.',
      imageRefused: 'Imaginea nu a putut fi citită. Încearcă un fișier JPG sau PNG.',
      photoAdded:
        'Fotografia a fost adăugată. Rămâne în acest browser, așa că linkul invitației arată ilustrația. Pentru a trimite fotografia, descarcă PNG.',
      photoTooLarge:
        'Fotografia a fost adăugată, dar este prea mare pentru a fi păstrată după reîncărcare. Linkul invitației arată ilustrația, așa că descarcă PNG pentru a trimite fotografia.',
      resetConfirm: 'Înlocuiești tot textul cu exemplul modelului?',
      resetDone: 'Textul a fost resetat la exemplul modelului.',
      copyPrompt: 'Copiază acest link:',
      imageToolLoading: 'Instrumentul pentru imagine încă se încarcă. Încearcă din nou imediat.',
      preparingImage: 'Se pregătește imaginea.',
      downloaded: 'Invitația a fost descărcată.',
      inviteShared: 'Invitația a fost distribuită.',
      downloadFailed: 'Descărcarea a eșuat. Încearcă din nou sau fă o captură de ecran.',
      noDate: 'Această invitație nu are încă o dată validă.',
      guestListDate: 'Adaugă data evenimentului înainte de a publica o invitație cu listă de invitați.',
      publish: 'Publică',
      publishChanges: 'Publică modificările',
      publishing: 'Se publică.',
      publishedHeading: 'Invitație publicată',
      changesPublishedHeading: 'Modificări publicate',
      storageRefused: 'Acest browser nu poate păstra invitația, așa că salvează linkul de administrare acum.',
      deletedOnServer: 'Această invitație a fost ștearsă împreună cu răspunsurile. Publică din nou pentru un link nou.',
      eventLinkCopied: 'Linkul invitației a fost copiat. Trimite-l într-un mesaj invitaților.',
      eventLinkShared: 'Linkul invitației a fost distribuit.',
      manageLinkCopied: 'Linkul de administrare a fost copiat. Păstrează-l într-un loc privat.',
    },
    // The guest view of a published invitation and its reply form.
    guest: {
      // The argument is a result of countdown() in countdown.js.
      countdown: ({ unit, count }) =>
        `Începe peste ${roCount(count, unit === 'days' ? ['o zi', 'zile'] : ['o oră', 'ore'])}`,
      replyErrors: (limits) => ({
        name: 'Scrie-ți numele.',
        attending: 'Alege dacă participi.',
        partySize: `Scrie un număr de la 1 la ${limits.partySize}.`,
        note: `Folosește cel mult ${limits.note} de caractere.`,
      }),
      sampleReply:
        'Răspunsul demonstrativ a fost verificat local. Nimic nu a fost trimis. Apasă „Creează invitația ta” pentru răspunsuri reale.',
      sendingReply: 'Se trimite răspunsul.',
      replySent: 'Răspuns trimis',
      replyUpdated: 'Răspuns actualizat',
      replyLinkCopied: 'Linkul de modificare a fost copiat. Păstrează-l pentru a schimba răspunsul mai târziu.',
      missingHeading: 'Această invitație nu există',
      endedHeading: 'Această invitație s-a încheiat',
      loadFailedHeading: 'Invitația nu a putut fi încărcată',
      defaultGuestHeading: 'Ești invitat',
      savedReplyShown: 'Este afișat răspunsul tău salvat. Modifică-l și trimite-l din nou.',
      noSavedReply: 'Încă nu există un răspuns salvat la acest link. Trimite formularul pentru a-l salva.',
      withdrawConfirm: 'Retragi răspunsul? Gazda nu îl va mai vedea.',
      withdrawingReply: 'Se retrage răspunsul.',
      brokenHeading: 'Acest link de invitație este incomplet',
      brokenMessage: 'Acest link de invitație este incomplet. Roagă gazda să trimită din nou linkul întreg.',
      openingHeading: 'Se deschide invitația',
      sampleNotice: 'Invitație demonstrativă. Răspunsurile trimise aici nu se salvează.',
      replyLinkUnavailable:
        'Acest link nu mai funcționează. Folosește linkul personal trimis de gazdă pentru a vedea sau modifica răspunsul.',
    },
    personal: {
      greeting: (name) => `Bună, ${name}!`,
      reminder: 'Te rugăm să ne spui dacă poți veni.',
      updateHeading: 'Mesaj nou de la gazdă',
      unavailable: 'Acest link nu mai funcționează. Cere-i gazdei un link nou.',
      noReply: 'Fără răspuns',
      showFriend: 'Arată invitația unui prieten',
      viewShared: 'Linkul de vizualizare a fost trimis.',
      viewCopied: 'Linkul de vizualizare a fost copiat.',
      heading: 'Confirmă participarea',
      attending: 'Vei participa?',
      yes: 'Da, voi veni',
      no: 'Nu pot ajunge',
      seats: 'Număr de persoane, inclusiv tu',
      note: 'Notă (opțional)',
      noteHint: 'Restricții alimentare sau un mesaj. Doar gazda îl vede.',
      send: 'Trimite răspunsul',
      withdraw: 'Retrage răspunsul',
      withdrawn: 'Răspuns retras',
    },
    seating: {
      add: 'Adaugă o masă',
      name: 'Numele sau numărul mesei',
      capacity: 'Număr de locuri',
      save: 'Salvează masa',
      remove: 'Elimină masa',
      removeConfirm: 'Elimini masa? Grupurile de la această masă vor rămâne fără masă.',
      picker: 'Mută la masă',
      unassigned: 'Fără masă',
      move: 'Mută grupul',
      seats: (filled, free) => `${filled} locuri ocupate, ${free} libere`,
      over: (seats) => `Peste capacitate cu ${roCount(seats, ['1 loc', 'locuri'])}`,
      partySeats: (seats) => roCount(seats, ['1 loc', 'locuri']),
      declined: 'A refuzat',
    },
    guestList: {
      invalidName: (max) => `Introdu un nume de cel mult ${max} de caractere pe fiecare rând.`,
      csvColumns: ['Nume', 'Stare', 'Locuri', 'Participă', 'Notă'],
      csvFile: 'petalpost-lista-invitati',
      replied: 'A răspuns',
      limit: (max) => `Lista de invitați poate avea cel mult ${max} de grupuri.`,
      rename: 'Redenumește',
      renamePrompt: 'Introdu noul nume al grupului.',
      renameInvalid: (max) => `Introdu un nume de grup de 1 până la ${max} de caractere.`,
      delete: 'Șterge grupul',
      confirmDelete: (name) => `Ștergi grupul „${name}” și răspunsul lui?`,
      partial: 'Unele grupuri au fost adăugate. Numele rămase sunt încă în formular.',
      retryPaste:
        'Încearcă din nou cu aceleași nume și locuri sau reîncarcă pagina ca să vezi ce grupuri au fost adăugate.',
      acceptedSeats: (n) => (n === 1 ? 'loc confirmat' : 'locuri confirmate'),
      declinedParties: (n) => (n === 1 ? 'grup a refuzat' : 'grupuri au refuzat'),
      pendingParties: (n) => (n === 1 ? 'grup fără răspuns' : 'grupuri fără răspuns'),
      defaultSeats: (n) => `Locuri implicite: ${n}`,
      language: { en: 'Engleză', ro: 'Română' },
      answer: (yes, n) => `A răspuns. ${yes ? 'Da' : 'Nu'}, ${n} ${n === 1 ? 'persoană' : 'persoane'}.`,
      overBy: (n) => `Cu ${n} în plus`,
      noReply: 'Fără răspuns',
      notOpened: 'Nedeschis',
      opened: 'Deschis',
      firstOpened: (time) => `Deschis prima dată ${time}`,
      lastOpened: (time) => `Ultima deschidere ${time}`,
      seatsLabel: 'Locuri confirmate',
      saveSeats: 'Salvează locurile',
      seatsSaved: 'Locurile au fost actualizate.',
      link: 'Link personal',
      copy: 'Copiază mesajul',
      copied: 'Mesajul a fost copiat.',
      copyPrompt: 'Copiază acest mesaj:',
      whatsapp: 'Trimite pe WhatsApp',
      remind: 'Trimite un memento pe WhatsApp',
      reminderUsed: 'WhatsApp a fost deschis',
      revoke: 'Revocă linkul personal',
      regenerate: 'Generează un link personal nou',
      revokeConfirm: 'Revoci linkul personal? Nu va mai funcționa.',
      regenerateConfirm: 'Generezi un link personal nou? Linkurile anterioare nu vor mai funcționa.',
      revoked: 'Linkul personal a fost revocat.',
      regenerated: 'Noul link personal a fost generat.',
      preview: 'Previzualizează ca acest invitat',
      editReply: 'Modifică răspunsul',
      saveReply: 'Salvează răspunsul',
      cancel: 'Anulează',
      replySaved: 'Răspunsul a fost salvat.',
      attending: 'Participă?',
      yes: 'Da',
      no: 'Nu',
      seats: 'Număr de persoane',
      note: 'Notă',
      switchConfirm:
        'Treci această invitație la modul listă de invitați? Linkul invitației și răspunsurile anterioare rămân, iar linkul public nu va mai primi răspunsuri noi.',
      attachTo: 'Asociază unui grup',
      attach: 'Asociază',
      attached: 'Răspunsul a fost asociat grupului.',
      noPartyToAttach: 'Adaugă un grup fără răspuns ca să asociezi acest răspuns.',
    },
    deadline: {
      none: 'Nu este setat niciun termen de confirmare. Confirmările rămân deschise până la încheierea invitației.',
      open: (date) => `Confirmările se închid pe ${date} la 23:59, ora Europe/Bucharest.`,
      closed: (date) => `Confirmările sunt închise. Termenul de confirmare a trecut pe ${date}.`,
      guestOpen: (date) => `Te rugăm să confirmi până pe ${date}.`,
      saved: 'Termenul de confirmare a fost salvat.',
      cleared: 'Termenul de confirmare a fost șters. Confirmările sunt deschise.',
    },
    partyUpdate: {
      invalid: (max) => `Introdu un mesaj de 1 până la ${max} de caractere.`,
      saved: 'Mesajul a fost salvat.',
      removed: 'Mesajul a fost șters.',
      removeConfirm: 'Ștergi mesajul de pe toate linkurile personale și linkurile de vizualizare?',
    },
    // The countdowns to the RSVP deadline and the deletion of a guest list, and the tracker's nudges. A left argument
    // is a result of countdown() in countdown.js.
    countdowns: {
      deadline: (left) => `Confirmările se închid peste ${roLeft(left)}.`,
      pending: (n) => `Încă nu ${n === 1 ? 'a' : 'au'} răspuns ${roCount(n, ['un grup', 'grupuri'])}.`,
      deletion: (left) => `Lista de invitați și răspunsurile ei se șterg peste ${roLeft(left)}.`,
      deletionDue: 'Lista de invitați și răspunsurile ei se șterg în cel mult o zi.',
      download: 'Descarcă lista de invitați în format CSV ca să păstrezi o copie.',
    },
    invite: {
      photoAlt: 'Fotografia evenimentului',
    },
    manage: {
      defaultHeading: 'Invitația ta',
      replyOne: 'răspuns',
      replyMany: 'răspunsuri',
      yesOne: 'confirmare',
      yesMany: 'confirmări',
      noOne: 'refuz',
      noMany: 'refuzuri',
      attendingOne: 'persoană confirmată',
      attendingMany: 'persoane confirmate',
      personOne: 'persoană',
      personMany: 'persoane',
      yesCount: (n) => `Da, ${n} ${n === 1 ? 'persoană' : 'persoane'}`,
      no: 'Nu',
      replied: 'A răspuns',
      changed: 'Modificat',
      loading: 'Se încarcă răspunsurile.',
      missingHeading: 'Această invitație nu există',
      endedHeading: 'Această invitație s-a încheiat',
      loadFailedHeading: 'Invitația nu a putut fi încărcată',
      eventLinkCopied: 'Linkul invitației a fost copiat. Trimite-l într-un mesaj invitaților.',
      copyPrompt: 'Copiază acest link:',
      deleteConfirm: 'Ștergi această invitație și toate răspunsurile ei? Acțiunea nu poate fi anulată.',
      deletedHeading: 'Invitație ștearsă',
      deletedMessage: 'Invitația și toate răspunsurile au fost șterse de pe Petalpost.',
      incompleteHeading: 'Acest link de administrare este incomplet',
      incompleteMessage: 'Acest link de administrare este incomplet. Deschide linkul întreg de unde l-ai salvat.',
    },
    passkey: {
      saved:
        'Cheia de acces a fost salvată. Pe alt dispozitiv cu același cont Apple, Google sau Microsoft, folosește „Găsește invitațiile mele” de pe pagina principală.',
      cancelled: 'Cererea pentru cheia de acces a fost anulată sau a expirat.',
      failed: 'Acest browser nu a putut folosi o cheie de acces. Încearcă alt browser sau alt dispozitiv.',
      opening: 'Se deschide invitația.',
    },
    // Excel in Romanian uses the comma as the decimal mark and a semicolon between values.
    csv: {
      separator: ';',
      columns: ['Nume', 'Participă', 'Persoane', 'Notă', 'A răspuns', 'Modificat'],
      yes: 'Da',
      no: 'Nu',
      file: 'petalpost-raspunsuri',
    },
    rsvp: {
      offline: 'Petalpost nu a putut fi contactat. Verifică conexiunea și încearcă din nou.',
      unexpected: 'A apărut o eroare pe server. Încearcă din nou peste un minut.',
    },
    report: {
      subject: 'Raportare invitație',
      body: (url) =>
        [
          `Invitație: ${url}`,
          '',
          'De ce acest conținut este ilegal, cu legea sau regula încălcată:',
          '',
          '',
          'Numele tău:',
          'Adresa ta de email:',
          '',
          'Raportez acest conținut cu bună-credință și cred că informațiile de mai sus sunt exacte și complete.',
        ].join('\n'),
    },
  },
};

/**
 * Localized API error strings for server/api.js.
 * @param {string} lang
 * @param {{
 *   replyNameLimit: number, partySizeLimit: number, replyNoteLimit: number, dailyEvents: number,
 *   eventResponses: number, eventPasskeys: number, partyNameLimit: number, partySeatsLimit: number, eventParties: number,
 *   updateNoticeLimit: number
 * }} limits
 */
export function apiMessages(
  lang,
  {
    replyNameLimit,
    partySizeLimit,
    replyNoteLimit,
    dailyEvents,
    eventResponses,
    eventPasskeys,
    partyNameLimit,
    partySeatsLimit,
    eventParties,
    updateNoticeLimit,
  },
) {
  if (normalizeLang(lang) === 'ro') {
    return {
      storage: 'Stocarea nu este disponibilă acum. Nimic nu a fost modificat. Încearcă din nou peste un minut.',
      path: 'Această adresă nu face parte din API-ul Petalpost.',
      method: 'Această adresă nu acceptă acest tip de cerere.',
      id: 'Acest link este incomplet sau deteriorat. Copiază linkul întreg și încearcă din nou.',
      unauthorized: 'Această acțiune necesită linkul privat. Deschide linkul întreg și încearcă din nou.',
      tooLarge: 'Cererea este prea mare.',
      body: 'Cererea nu a putut fi citită.',
      version: 'Versiunea trebuie să fie un număr întreg pozitiv.',
      invite: 'Invitația conține câmpuri lipsă, prea lungi sau nepermise.',
      guestListDate: UI.ro.editor.guestListDate,
      reply: `Introdu un nume de cel mult ${replyNameLimit} de caractere, un răspuns și un număr de persoane între 1 și ${partySizeLimit} dacă participi. Nota poate avea cel mult ${replyNoteLimit} de caractere.`,
      eventMissing: 'Această invitație nu există. Este posibil să fi fost ștearsă.',
      eventEnded: 'Această invitație s-a încheiat.',
      replyMissing: 'Acest răspuns nu există. Este posibil să fi fost retras sau șters împreună cu invitația.',
      eventForbidden: 'Acest link nu oferă acces la această invitație.',
      replyForbidden: 'Acest link nu oferă acces la acest răspuns.',
      eventChanged:
        'Această invitație a fost modificată în alt browser de la ultima publicare. O nouă publicare înlocuiește acele modificări.',
      replyChanged: 'Acest răspuns a fost modificat în alt browser. Este afișat cel mai recent răspuns.',
      dailyEvents: `Această conexiune a publicat deja ${dailyEvents} invitații azi. Încearcă din nou mâine.`,
      eventFull: `Această invitație are deja ${eventResponses} răspunsuri, limita maximă acceptată.`,
      guestListReply: 'Această invitație primește confirmări doar prin linkurile personale trimise de gazdă.',
      replyLinkUnavailable: UI.ro.guest.replyLinkUnavailable,
      modeHasParties: 'Nu poți reveni la modul deschis după ce ai adăugat grupuri pe lista de invitați.',
      signInExpired:
        'Conectarea cu cheia de acces a expirat. Apasă din nou „Găsește invitațiile mele” pe pagina principală.',
      passkey: 'Cheia de acces nu a putut fi verificată. Încearcă din nou.',
      passkeyMissing:
        'Această cheie de acces nu mai deschide nicio invitație. Este posibil ca invitația să fi fost ștearsă.',
      eventPasskeys: `Această invitație are deja ${eventPasskeys} chei de acces, limita maximă acceptată.`,
      party: `Introdu un nume de 1 până la ${partyNameLimit} de caractere și alege între 1 și ${partySeatsLimit} de locuri.`,
      partyName: UI.ro.guestList.renameInvalid(partyNameLimit),
      partyMissing: 'Grupul nu mai există pe lista de invitați.',
      partyMode: 'Doar invitațiile cu listă de invitați pot avea linkuri personale.',
      updateMode: 'Doar invitațiile cu listă de invitați pot avea mesaje noi.',
      updateNotice: UI.ro.partyUpdate.invalid(updateNoticeLimit),
      partyLimit: UI.ro.guestList.limit(eventParties),
      partyId: 'Grupul nu a putut fi adăugat. Încearcă din nou.',
      partyHasReply: 'Acest grup are deja un răspuns.',
      replyAttached: 'Acest răspuns este deja asociat unui alt grup.',
      personalLink: UI.ro.personal.unavailable,
      partyLinkChanged: 'Linkul personal s-a schimbat. Verifică linkul actual.',
      partyReply: `Alege un răspuns și între 1 și ${partySeatsLimit} de locuri dacă participi. Nota poate avea cel mult ${replyNoteLimit} de caractere.`,
      partySeats: `Introdu un număr de locuri între 0 și ${partySeatsLimit}.`,
      deadline: 'Alege o dată calendaristică validă pentru termenul de confirmare.',
      deadlineMode: 'Doar invitațiile cu listă de invitați pot avea un termen de confirmare.',
      deadlinePassed: 'Confirmările sunt închise deoarece termenul de confirmare a trecut.',
      table: 'Introdu un nume și un număr valid de locuri pentru masă.',
      tableMode: 'Mesele sunt disponibile doar pentru invitațiile cu listă de invitați.',
      tableMissing: 'Masa nu mai este disponibilă.',
      tableChanged: 'Masa a fost modificată. Verifică detaliile actuale.',
    };
  }
  return {
    storage: 'Storage is unavailable right now. Nothing was changed. Try again in a minute.',
    path: 'This address is not part of the Petalpost API.',
    method: 'This address does not accept that request.',
    id: 'This link is incomplete or damaged. Copy the whole link and try again.',
    unauthorized: 'This action needs the private link. Open the whole link and try again.',
    tooLarge: 'The request is too large.',
    body: 'The request could not be read.',
    version: 'The version must be a positive whole number.',
    invite: 'The invitation has fields that are missing, too long or not allowed.',
    guestListDate: UI.en.editor.guestListDate,
    reply: `Enter a name of up to ${replyNameLimit} characters, an answer, and a party size from 1 to ${partySizeLimit} when attending. A note can have up to ${replyNoteLimit} characters.`,
    eventMissing: 'This invitation does not exist. It may have been deleted.',
    eventEnded: 'This invitation has ended.',
    replyMissing: 'This reply does not exist. It may have been withdrawn or deleted with the invitation.',
    eventForbidden: 'This link does not give access to this invitation.',
    replyForbidden: 'This link does not give access to this reply.',
    eventChanged:
      'This invitation changed in another browser since you last published. Publishing again replaces those changes.',
    replyChanged: 'This reply changed in another browser. The latest answer is shown.',
    dailyEvents: `This connection has published ${dailyEvents} invitations today. Try again tomorrow.`,
    eventFull: `This invitation already has ${eventResponses} replies, the most it can take.`,
    guestListReply: 'This invitation takes replies only through the personal links the host sends.',
    replyLinkUnavailable: UI.en.guest.replyLinkUnavailable,
    modeHasParties: 'You cannot switch back to the open mode once parties exist on the guest list.',
    signInExpired: 'The passkey sign-in has expired. Use "Find my invitations" on the home page again.',
    passkey: 'The passkey could not be checked. Try again.',
    passkeyMissing: 'This passkey no longer opens an invitation. The invitation may have been deleted.',
    eventPasskeys: `This invitation already has ${eventPasskeys} passkeys, the most it can take.`,
    party: `Enter a name of 1 to ${partyNameLimit} characters and choose between 1 and ${partySeatsLimit} seats.`,
    partyName: UI.en.guestList.renameInvalid(partyNameLimit),
    partyMissing: 'The party is no longer on the guest list.',
    partyMode: 'Only guest-list invitations can have personal links.',
    updateMode: 'Only guest-list invitations can have updates.',
    updateNotice: UI.en.partyUpdate.invalid(updateNoticeLimit),
    partyLimit: UI.en.guestList.limit(eventParties),
    partyId: 'The party could not be added. Try again.',
    partyHasReply: 'This party already has a reply.',
    replyAttached: 'This reply is already attached to another party.',
    personalLink: UI.en.personal.unavailable,
    partyLinkChanged: 'The personal link changed. Check the current link.',
    partyReply: `Choose an answer and between 1 and ${partySeatsLimit} seats when attending. A note can have up to ${replyNoteLimit} characters.`,
    partySeats: `Enter a number of seats from 0 to ${partySeatsLimit}.`,
    deadline: 'Choose a valid calendar date for the RSVP deadline.',
    deadlineMode: 'Only guest-list invitations can have an RSVP deadline.',
    deadlinePassed: 'Replies are closed because the RSVP deadline has passed.',
    table: 'Enter a name and a valid number of seats for the table.',
    tableMode: 'Tables are available only for guest-list invitations.',
    tableMissing: 'The table is no longer available.',
    tableChanged: 'The table changed. Check its current details.',
  };
}
