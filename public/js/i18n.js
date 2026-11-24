// Locale metadata, route pairings and UI copy shared by browser modules, static page generation and the RSVP API.
// No DOM access, so Node scripts and server/api.js import it directly; tests/check-dom-free.js enforces it.

export const LANGS = ['en', 'ro'];

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

export const UI = {
  en: {
    photoAlt: 'Event photo',
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
      publish: 'Publish',
      publishChanges: 'Publish changes',
      publishing: 'Publishing.',
      publishedFirst: 'Published. Send the invitation link to your guests.',
      publishedUpdated: 'Published. Guests see the changes when they open the invitation link.',
      storageRefused: 'This browser cannot keep the invitation, so save the management link now.',
      deletedOnServer: 'This invitation was deleted with its replies. Publish again to make a new invitation link.',
      eventLinkCopied: 'Invitation link copied. Paste it into a message to your guests.',
      eventLinkShared: 'Invitation link shared.',
      manageLinkCopied: 'Management link copied. Keep it somewhere private.',
      replyErrors: (limits) => ({
        name: 'Enter your name.',
        attending: 'Choose whether you will attend.',
        partySize: `Enter a number from 1 to ${limits.partySize}.`,
        note: `Use at most ${limits.note} characters.`,
      }),
      sampleReply:
        'Sample reply checked locally. Nothing was sent. Use Make your own to collect real replies and track headcount.',
      sendingReply: 'Sending your reply.',
      replySaved: 'Your reply is saved. The host can see it now.',
      replyLinkCopied: 'Edit link copied. Keep it to change your reply later.',
      missingHeading: 'This invitation does not exist',
      loadFailedHeading: 'The invitation could not be loaded',
      defaultGuestHeading: 'You are invited',
      savedReplyShown: 'Your saved reply is shown. Change it and send it again.',
      noSavedReply: 'No reply is saved under this link yet. Send the form to save one.',
      withdrawConfirm: 'Withdraw your reply? The host will no longer see it.',
      withdrawingReply: 'Withdrawing your reply.',
      replyWithdrawn: 'Your reply is withdrawn. The host no longer sees it. You can send a new reply.',
      brokenHeading: 'This invite link is incomplete',
      brokenMessage: 'This invite link is incomplete. Ask the host to send the whole link again.',
      openingHeading: 'Opening the invitation',
      sampleNotice: 'Sample invitation. Replies submitted here are not saved.',
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
      loadFailedHeading: 'The invitation could not be loaded',
      eventLinkCopied: 'Invitation link copied. Paste it into a message to your guests.',
      copyPrompt: 'Copy this link:',
      deleteConfirm: 'Delete this invitation and all its replies? This cannot be undone.',
      deletedHeading: 'Invitation deleted',
      deletedMessage: 'The invitation and all its replies are deleted from Petalpost.',
      incompleteHeading: 'This management link is incomplete',
      incompleteMessage: 'This management link is incomplete. Open the whole link from where you saved it.',
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
    photoAlt: 'Fotografia evenimentului',
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
      publish: 'Publică',
      publishChanges: 'Publică modificările',
      publishing: 'Se publică.',
      publishedFirst: 'Publicată. Trimite linkul invitației către invitați.',
      publishedUpdated: 'Publicată. Invitații vor vedea modificările când deschid linkul.',
      storageRefused: 'Acest browser nu poate păstra invitația, așa că salvează linkul de administrare acum.',
      deletedOnServer: 'Această invitație a fost ștearsă împreună cu răspunsurile. Publică din nou pentru un link nou.',
      eventLinkCopied: 'Linkul invitației a fost copiat. Trimite-l într-un mesaj invitaților.',
      eventLinkShared: 'Linkul invitației a fost distribuit.',
      manageLinkCopied: 'Linkul de administrare a fost copiat. Păstrează-l într-un loc privat.',
      replyErrors: (limits) => ({
        name: 'Scrie-ți numele.',
        attending: 'Alege dacă participi.',
        partySize: `Scrie un număr de la 1 la ${limits.partySize}.`,
        note: `Folosește cel mult ${limits.note} de caractere.`,
      }),
      sampleReply:
        'Răspunsul demonstrativ a fost verificat local. Nimic nu a fost trimis. Apasă „Creează invitația ta” pentru răspunsuri reale.',
      sendingReply: 'Se trimite răspunsul.',
      replySaved: 'Răspunsul tău a fost salvat. Gazda îl poate vedea acum.',
      replyLinkCopied: 'Linkul de modificare a fost copiat. Păstrează-l pentru a schimba răspunsul mai târziu.',
      missingHeading: 'Această invitație nu există',
      loadFailedHeading: 'Invitația nu a putut fi încărcată',
      defaultGuestHeading: 'Ești invitat',
      savedReplyShown: 'Este afișat răspunsul tău salvat. Modifică-l și trimite-l din nou.',
      noSavedReply: 'Încă nu există un răspuns salvat la acest link. Trimite formularul pentru a-l salva.',
      withdrawConfirm: 'Retragi răspunsul? Gazda nu îl va mai vedea.',
      withdrawingReply: 'Se retrage răspunsul.',
      replyWithdrawn: 'Răspunsul tău a fost retras. Gazda nu îl mai vede. Poți trimite un răspuns nou.',
      brokenHeading: 'Acest link de invitație este incomplet',
      brokenMessage: 'Acest link de invitație este incomplet. Roagă gazda să trimită din nou linkul întreg.',
      openingHeading: 'Se deschide invitația',
      sampleNotice: 'Invitație demonstrativă. Răspunsurile trimise aici nu se salvează.',
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
      loadFailedHeading: 'Invitația nu a putut fi încărcată',
      eventLinkCopied: 'Linkul invitației a fost copiat. Trimite-l într-un mesaj invitaților.',
      copyPrompt: 'Copiază acest link:',
      deleteConfirm: 'Ștergi această invitație și toate răspunsurile ei? Acțiunea nu poate fi anulată.',
      deletedHeading: 'Invitație ștearsă',
      deletedMessage: 'Invitația și toate răspunsurile au fost șterse de pe Petalpost.',
      incompleteHeading: 'Acest link de administrare este incomplet',
      incompleteMessage: 'Acest link de administrare este incomplet. Deschide linkul întreg de unde l-ai salvat.',
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
 * @param {{ replyNameLimit: number, partySizeLimit: number, replyNoteLimit: number, dailyEvents: number, eventResponses: number }} limits
 */
export function apiMessages(lang, { replyNameLimit, partySizeLimit, replyNoteLimit, dailyEvents, eventResponses }) {
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
      reply: `Introdu un nume de cel mult ${replyNameLimit} de caractere, un răspuns și un număr de persoane între 1 și ${partySizeLimit} dacă participi. Nota poate avea cel mult ${replyNoteLimit} de caractere.`,
      eventMissing: 'Această invitație nu există. Este posibil să fi fost ștearsă.',
      replyMissing: 'Acest răspuns nu există. Este posibil să fi fost retras sau șters împreună cu invitația.',
      eventForbidden: 'Acest link nu oferă acces la această invitație.',
      replyForbidden: 'Acest link nu oferă acces la acest răspuns.',
      eventChanged:
        'Această invitație a fost modificată în alt browser de la ultima publicare. O nouă publicare înlocuiește acele modificări.',
      replyChanged: 'Acest răspuns a fost modificat în alt browser. Este afișat cel mai recent răspuns.',
      dailyEvents: `Această conexiune a publicat deja ${dailyEvents} invitații azi. Încearcă din nou mâine.`,
      eventFull: `Această invitație are deja ${eventResponses} răspunsuri, limita maximă acceptată.`,
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
    reply: `Enter a name of up to ${replyNameLimit} characters, an answer, and a party size from 1 to ${partySizeLimit} when attending. A note can have up to ${replyNoteLimit} characters.`,
    eventMissing: 'This invitation does not exist. It may have been deleted.',
    replyMissing: 'This reply does not exist. It may have been withdrawn or deleted with the invitation.',
    eventForbidden: 'This link does not give access to this invitation.',
    replyForbidden: 'This link does not give access to this reply.',
    eventChanged:
      'This invitation changed in another browser since you last published. Publishing again replaces those changes.',
    replyChanged: 'This reply changed in another browser. The latest answer is shown.',
    dailyEvents: `This connection has published ${dailyEvents} invitations today. Try again tomorrow.`,
    eventFull: `This invitation already has ${eventResponses} replies, the most it can take.`,
  };
}
