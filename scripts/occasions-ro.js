// The text of each Romanian occasion page that scripts/pages.js generates, keyed by canonical template category.
// Every category in categoriesFor('ro') needs an entry; check-site.js fails when one is missing.
// Each description holds at least one Romanian search phrase from check-site.js, such as gratuit, online, WhatsApp or
// confirmare.
// A section renders intro, list, quotes, then paragraphs. Its strings are trusted HTML written here, so they may hold
// links and inline markup.

export const OCCASIONS_RO = {
  Wedding: {
    file: 'ro/invitatii-nunta.html',
    heading: 'Invitații de nuntă',
    description:
      'Modele ilustrate de invitații de nuntă online, de la flori și arcade de ceremonie până la seri de gală în catifea. Trimite linkul pe WhatsApp și urmărește confirmările.',
    lead: 'Flori de grădină, arcade de ceremonie, tort cu etaje, măslin cu teracotă și seri de gală în catifea. Adaugă numele voastre, detaliile ceremoniei și o fotografie împreună.',
    sections: [
      {
        heading: 'Ce conține o invitație de nuntă',
        intro: ['O invitație clară îi ajută pe invitați să își planifice ușor ziua, fără mesaje suplimentare:'],
        list: [
          '<strong>Mirii, părinții și nașii.</strong> În România, invitațiile de nuntă menționează adesea familiile și nașii, dar pentru o nuntă relaxată sunt suficiente prenumele mirilor.',
          '<strong>Data și ora în format de 24 de ore.</strong> Scrie clar ora cununiei și, dacă petrecerea este la altă adresă, ora de începere de la restaurant.',
          '<strong>Biserica și restaurantul.</strong> Linkul invitației include buton de hartă pentru adresa principală; în notă poți menționa și a doua locație.',
          '<strong>Termenul de confirmare.</strong> Alege o dată cu 3 până la 4 săptămâni înainte, ca să poți trimite numărul final de persoane la restaurant.',
          '<strong>Detalii utile.</strong> Menționează codul vestimentar sau preferințele alimentare doar dacă sunt importante pentru eveniment.',
        ],
      },
      {
        heading: 'Idei de text pentru invitația de nuntă',
        quotes: [
          'Împreună cu părinții și nașii noștri, noi, Elena și Toma, vă invităm să ne fiți alături în ziua nunții.',
          'Spunem „Da!” și continuăm cu cină și dans sub stele. Abia așteptăm să sărbătorim împreună.',
          'Ne căsătorim! Vă așteptăm cu drag la cununia religioasă și la petrecerea de după.',
        ],
        paragraphs: [
          'Păstrează mesajul scurt și cald pe card. Pentru mai multe exemple pe fiecare rând al invitației, citește <a href="/ro/text-invitatii.html">ghidul de texte pentru invitații</a>.',
        ],
      },
      {
        heading: 'Când să trimiți invitațiile de nuntă',
        paragraphs: [
          'Trimite un anunț preliminar cu 6 până la 8 luni înainte, mai ales pentru nunțile de vară sau dacă invitații vin din alt oraș. Invitația completă se trimite cu 6 până la 8 săptămâni înainte, cu termen de confirmare la 3 sau 4 săptămâni înainte de eveniment. Vezi calendarul complet în <a href="/ro/cand-sa-trimiti-invitatiile.html">când să trimiți invitațiile</a>.',
        ],
      },
    ],
  },
  Cununie: {
    file: 'ro/invitatii-cununie.html',
    heading: 'Invitații de cununie civilă',
    description:
      'Invitații gratuite de cununie civilă cu verighete, bujori și șampanie. Adaugă data, ora și adresa primăriei, apoi trimite linkul cu confirmare de prezență.',
    lead: 'Verighete aurii, bujori de mai, cupe de șampanie și arcadă de seară. Personalizează invitația pentru Starea Civilă și trimite-o rapid pe WhatsApp.',
    sections: [
      {
        heading: 'Ce să treci pe invitația de cununie civilă',
        intro: [
          'Cununia civilă are un program precis, așa că ora și adresa exactă contează cel mai mult pentru invitați:',
        ],
        list: [
          '<strong>Numele voastre.</strong> Prenumele sunt potrivite și calde pentru o cununie civilă cu familia și prietenii.',
          '<strong>Ora exactă la Starea Civilă.</strong> Recomandă invitaților să ajungă cu 15 minute mai devreme, pentru că ceremoniile la primărie încep punctual.',
          '<strong>Adresa Casei Căsătoriilor sau a Primăriei.</strong> Butonul de hartă din invitație îi duce direct la intrare.',
          '<strong>Ce urmează după ceremonie.</strong> Spune clar în notă dacă organizați un toast, un prânz sau o cină la restaurant și la ce oră începe.',
          '<strong>Data limită de confirmare.</strong> Dacă ai rezervare la restaurant, cere confirmarea cu cel puțin 10–14 zile înainte.',
        ],
      },
      {
        heading: 'Idei de text pentru cununia civilă',
        quotes: [
          'Spunem „Da!” la Starea Civilă și vrem să ne fiți aproape. După ceremonie toastăm împreună la terasă.',
          'Vă invităm cu drag la cununia noastră civilă. Sărbătorim apoi cu prânz și șampanie alături de cei dragi.',
          'Facem pasul cel mare! Ne vedem la Primărie de la ora 13:00, iar seara continuăm cu o cină festivă.',
        ],
        paragraphs: [
          'Dacă organizați cununia civilă și nunta în zile diferite, o invitație digitală separată pentru cununie păstrează detaliile limpezi pentru grupul restrâns. Mai multe formulări găsești în <a href="/ro/text-invitatii.html">ghidul de texte pentru invitații</a>.',
        ],
      },
      {
        heading: 'Când să trimiți invitațiile de cununie',
        paragraphs: [
          'Trimite invitația de cununie civilă cu 3 până la 4 săptămâni înainte de ceremonie, sau cu 6 săptămâni înainte dacă ai invitați care călătoresc din alt oraș. După ce publici invitația pe Petalpost, poți urmări confirmările și numărul total de persoane direct din pagina de administrare.',
        ],
      },
    ],
  },
  Botez: {
    file: 'ro/invitatii-botez.html',
    heading: 'Invitații de botez',
    description:
      'Modele ilustrate de invitații de botez cu porumbel alb, lumânare cu flori, nori și leagăn. Personalizează gratuit și colectează confirmări online.',
    lead: 'Porumbel alb, lumânare de botez cu trandafiri, nori cu steluțe și leagăn de lemn. Adaugă fotografia copilului, biserica și restaurantul.',
    sections: [
      {
        heading: 'Ce să incluzi pe o invitație de botez',
        intro: [
          'Botezul are de obicei două momente în aceeași zi, slujba la biserică și petrecerea, așa că structura clară face diferența:',
        ],
        list: [
          '<strong>Numele copilului.</strong> Pune-l în titlu, de exemplu „Botezul lui Matei” sau „Botezul Sofiei”, ca invitația să fie ușor de recunoscut.',
          '<strong>Părinții și nașii.</strong> În câmpul de gazde poți trece atât părinții, cât și nașii de botez.',
          '<strong>Biserica și ora slujbei.</strong> Trecute la locație și oră, ca invitații să poată deschide harta și să adauge evenimentul în calendar.',
          '<strong>Restaurantul și ora petrecerii.</strong> Adaugă numele salonului și ora de începere în nota scurtă de pe card.',
          '<strong>Confirmarea participării.</strong> Cere confirmarea cu 2–3 săptămâni înainte, pentru a stabili meniul și locurile la mese.',
        ],
      },
      {
        heading: 'Idei de text pentru invitația de botez',
        quotes: [
          'Cu mare bucurie vă invităm la botezul lui Matei. După slujbă vă așteptăm la masa festivă să sărbătorim împreună.',
          'Mami, tati și nașii vă invită să fiți alături de Sofia în ziua creștinării ei.',
          'Vă chemăm cu drag la botezul micuțului nostru Luca. Continuăm bucuria la restaurant, de la ora 13:30.',
        ],
        paragraphs: [
          'O fotografie zâmbitoare a bebelușului transformă invitația într-o amintire frumoasă pentru bunici și prieteni. Dacă vrei mai multe idei de formulare, vezi <a href="/ro/text-invitatii.html">ghidul de texte pentru invitații</a>.',
        ],
      },
      {
        heading: 'Când să trimiți invitațiile de botez',
        paragraphs: [
          'Trimite invitațiile de botez cu 4 până la 6 săptămâni înainte de eveniment și stabilește confirmarea cu 2 săptămâni înainte. Dacă trimiți linkul pe WhatsApp, invitații pot confirma în câteva secunde, iar tu vezi imediat totalul de persoane. Vezi toate reperele în <a href="/ro/cand-sa-trimiti-invitatiile.html">când să trimiți invitațiile</a>.',
        ],
      },
    ],
  },
  Moț: {
    file: 'ro/invitatii-mot.html',
    heading: 'Invitații de moț',
    description:
      'Modele ilustrate de invitații de moț cu foarfecă și șuviță, tava cu obiecte, turtă și tort cu lumânarea 1. Adaugă numele copilului, nașii și restaurantul, apoi trimite linkul pe WhatsApp.',
    lead: 'Foarfecă și șuviță legată cu fundă, tava cu carte, stilou, bănuț și lingură, turta decorată și tortul cu baloane. Pentru ziua în care cel mic împlinește un an și i se taie moțul.',
    sections: [
      {
        heading: 'Ce să treci pe invitația de moț',
        intro: [
          'Moțul se face de obicei la împlinirea unui an, cu nașii alături, așa că invitația are nevoie de câteva repere clare:',
        ],
        list: [
          '<strong>Numele copilului.</strong> Pune-l în titlu, de exemplu „Moțul Sofiei” sau „Moțul lui Luca”.',
          '<strong>Părinții și nașii.</strong> Nașii taie de obicei moțul, așa că trece-i alături de părinți în câmpul de gazde.',
          '<strong>Restaurantul sau casa.</strong> Adresa completă apare pe invitație cu buton de hartă.',
          '<strong>Ora petrecerii.</strong> Tăierea moțului și ruptul turtei au loc în timpul petrecerii, așa că spune în notă dacă vrei ca invitații să ajungă la timp pentru ele.',
          '<strong>Termenul de confirmare.</strong> Cere confirmarea cu 2 săptămâni înainte, ca să știi câte locuri rezervi la restaurant.',
        ],
      },
      {
        heading: 'Idei de text pentru invitația de moț',
        quotes: [
          'Sofia împlinește un an! Vă invităm cu drag la tăierea moțului și la masa de sărbătoare.',
          'Alături de nașii Ana și Bogdan, tăiem moțul lui Luca și rupem turta. Vă așteptăm să ne fiți aproape.',
          'Primul an a trecut în zbor. Vino să alegem împreună viitorul lui Matei din tava cu obiecte.',
        ],
        paragraphs: [
          'În notă poți spune ce urmează după tăierea moțului, de exemplu tortul sau alegerea obiectelor din tavă. Pentru alte formulări, vezi <a href="/ro/text-invitatii.html">ghidul de texte pentru invitații</a>.',
        ],
      },
      {
        heading: 'Când să trimiți invitațiile de moț',
        paragraphs: [
          'Trimite invitațiile de moț cu 4 până la 6 săptămâni înainte de petrecere, ca la botez, și cere confirmarea cu 2 săptămâni înainte. Vezi toate reperele în <a href="/ro/cand-sa-trimiti-invitatiile.html">când să trimiți invitațiile</a>.',
        ],
      },
    ],
  },
  Birthday: {
    file: 'ro/invitatii-zi-de-nastere.html',
    heading: 'Invitații de zi de naștere',
    description:
      'Modele ilustrate gratuite de invitații de zi de naștere cu baloane, tort, coifuri și cadouri. Adaugă fotografia și detaliile petrecerii, apoi trimite linkul pe WhatsApp.',
    lead: 'Baloane, tort cu lumânări, coifuri de petrecere și cadouri. Alege un model, adaugă sărbătoritul și detaliile petrecerii, apoi trimite linkul.',
    sections: [
      {
        heading: 'Ce să pui pe o invitație de zi de naștere',
        intro: [
          'Invitații caută imediat trei informații: a cui este ziua, când are loc petrecerea și unde trebuie să ajungă. Trecerea numelui în titlu, de exemplu „Maria împlinește 7 ani”, răspunde din prima secundă.',
        ],
        list: [
          '<strong>Sărbătoritul și vârsta.</strong> Pentru copii și aniversări rotunde, vârsta dă tonul. Pentru adulți poți scrie simplu „Hai să o sărbătorim pe Dana”.',
          '<strong>Data și ora de început.</strong> La petrecerile pentru copii, menționează în notă și ora de final ca părinții să știe când revin.',
          '<strong>Locația și adresa completă.</strong> Linkul invitației adaugă automat un buton de Google Maps pentru adresa introdusă.',
          '<strong>Ce îi așteaptă pe invitați.</strong> O frază despre tort, jocuri, tematică sau dress code scutește zeci de întrebări.',
          '<strong>Termenul de confirmare.</strong> O dată cu o săptămână înainte îți lasă timp să comanzi tortul și gustările.',
        ],
      },
      {
        heading: 'Idei de text pentru zi de naștere',
        quotes: [
          'Ești invitat la ziua Mariei, care împlinește 7 ani! Tort, jocuri și o piñata. Adu cel mai vesel zâmbet.',
          'Luca împlinește un an! Vino să sărbătorim împreună prima lui tură în jurul soarelui.',
          '30 de ani și chef de petrecere! Hai la cină, muzică și dans în cinstea lui Tudor.',
          'Șșșt, e petrecere surpriză! Vino până la 19:15 ca să strigăm toți deodată.',
        ],
        paragraphs: [
          'Pentru o petrecere surpriză, menționează clar secretul sus pe card și dă o oră de sosire cu 15–30 de minute mai devreme. Mai multe exemple găsești în <a href="/ro/text-invitatii.html">ghidul de texte pentru invitații</a>.',
        ],
      },
      {
        heading: 'Când să o trimiți',
        paragraphs: [
          'Trimite invitațiile de zi de naștere cu 2–3 săptămâni înainte. În timpul școlii, weekendurile se ocupă repede, așa că 3 săptămâni oferă mai multă siguranță. Pentru o aniversare rotundă cu invitați din alt oraș, anunță cu 6 săptămâni înainte. Citește și <a href="/ro/cand-sa-trimiti-invitatiile.html">când să trimiți invitațiile</a>.',
        ],
      },
    ],
  },
  Housewarming: {
    file: 'ro/invitatii-casa-noua.html',
    heading: 'Invitații de casă nouă',
    description:
      'Invitații online de casă nouă cu plante, chei noi și ferestre calde. Adaugă noua adresă, trimite linkul și vezi cine confirmă că vine.',
    lead: 'Acoperiș cald, plante pe raft, chei noi și o pisică la fereastră. Invită prietenii să îți vadă noul loc.',
    sections: [
      {
        heading: 'Ce să pui pe o invitație de casă nouă',
        list: [
          '<strong>Noua adresă completă.</strong> Este singurul detaliu pe care invitații nu îl pot ghici. Include blocul, scara, etajul și apartamentul.',
          '<strong>Acces și parcare.</strong> Codul de la interfon sau unde se poate parca ușor în zonă.',
          '<strong>Data și intervalul orar.</strong> Dacă apartamentul e mic, un interval deschis de tipul 17:00–21:00 îi lasă pe prieteni să vină treptat.',
          '<strong>Cadouri.</strong> Prietenii aduc de obicei ceva de casă nouă; dacă nu vrei cadouri, scrie simplu „fără cadouri, doar prezența voastră”.',
          '<strong>Animale de companie.</strong> Menționează dacă ai câine sau pisică, util pentru invitații cu alergii.',
        ],
      },
      {
        heading: 'Idei de text pentru casă nouă',
        quotes: [
          'Chei noi, casă nouă, aceeași gașcă. Vino să vezi apartamentul!',
          'Ne-am mutat! Vă așteptăm la gustări, băuturi și turul oficial al tuturor camerelor.',
          'Cidru cald, jocuri de societate și un motan foarte prietenos. Petrecere de casă nouă la noi.',
          'Ușa e deschisă între 16:00 și 20:00. Treci oricând ai chef de o cafea și o poveste.',
        ],
      },
      {
        heading: 'Când să o trimiți',
        paragraphs: [
          'Organizează petrecerea după ce ai despachetat cutiile, de regulă la 1–3 luni după mutare, și trimite invitația cu 2–3 săptămâni înainte. Invitația funcționează și ca anunț pentru noua adresă, așa că o poți trimite și celor care nu pot ajunge.',
        ],
      },
    ],
  },
  Graduation: {
    file: 'ro/invitatii-absolvire.html',
    heading: 'Invitații de absolvire',
    description:
      'Invitații de absolvire gratuite cu tocă, diplomă, cărți și răsărit. Adaugă fotografia absolventului și cere confirmarea prezenței la festivitate.',
    lead: 'Ciucure auriu, diplomă cu sigiliu, teanc de cărți și un răsărit luminos. Sărbătorește finalul liceului, facultății sau doctoratului.',
    sections: [
      {
        heading: 'Anunț de absolvire sau invitație la petrecere?',
        paragraphs: [
          'Festivitățile de absolvire au adesea locuri limitate în sală, așa că majoritatea familiilor trimit o singură invitație care anunță reușita și cheamă prietenii și rudele la masa sau petrecerea de după.',
        ],
      },
      {
        heading: 'Ce să pui pe o invitație de absolvire',
        list: [
          '<strong>Absolventul și promoția.</strong> Numele, facultatea sau liceul și anul, de exemplu „Promoția 2027”.',
          '<strong>O fotografie.</strong> O poză cu toga sau de la cursul festiv face invitația memorabilă.',
          '<strong>Data, ora și locul petrecerii.</strong> Pentru o întâlnire relaxată acasă, poți trece un interval orar în notă.',
          '<strong>Ce urmează.</strong> Poți menționa pe scurt masterul sau următorul pas al absolventului.',
        ],
      },
      {
        heading: 'Idei de text pentru absolvire',
        quotes: [
          'A reușit! Vino să o sărbătorim pe Daria, promoția 2027.',
          'După ani de examene vine petrecerea. Cină, tort și toasturi în cinstea lui Matei.',
          'Sus toca pentru Ioana! Sărbătorim susținerea doctoratului cu prietenii și familia.',
        ],
      },
      {
        heading: 'Când să o trimiți',
        paragraphs: [
          'Sezonul absolvirilor adună multe evenimente în câteva weekenduri din mai și iunie. Trimite invitațiile cu 3–4 săptămâni înainte, ca invitații să își poată rezerva ziua.',
        ],
      },
    ],
  },
  'Baby shower': {
    file: 'ro/invitatii-baby-shower.html',
    heading: 'Invitații de baby shower',
    description:
      'Modele ilustrate de invitații de baby shower cu nori, rățușcă, iepuraș și ursuleț. Trimite invitația online pe WhatsApp și află cine vine.',
    lead: 'Nori somnoroși, rățușcă veselă, iepuraș și ursuleț cu balon. Anunță venirea pe lume a bebelușului cu o invitație caldă.',
    sections: [
      {
        heading: 'Ce să pui pe o invitație de baby shower',
        list: [
          '<strong>În cinstea cui se organizează.</strong> „Vine bebe Noa!” sau „Baby shower pentru Olivia” chiar în titlu.',
          '<strong>Cine organizează.</strong> De obicei o prietenă sau o rudă se ocupă de confirmări.',
          '<strong>Data, ora și locația.</strong> Un brunch sau o după-amiază de 2–3 ore în weekend funcționează cel mai bine.',
          '<strong>Lista de cadouri sau tematica.</strong> Dacă există o listă de dorințe sau preferințe, scrie o linie scurtă în notă.',
        ],
      },
      {
        heading: 'Idei de text pentru baby shower',
        quotes: [
          'Un mic miracol e pe drum! Te invităm la un baby shower în cinstea Sarei.',
          'Brunch, jocuri și urări dulci pentru bebelușul care vine în curând.',
          'Adu o carte de povești în loc de felicitare, ca să începem prima bibliotecă a lui bebe.',
        ],
      },
      {
        heading: 'Când să o trimiți',
        paragraphs: [
          'Petrecerea de baby shower are loc de obicei cu 4 până la 8 săptămâni înainte de naștere. Trimite invitația cu 4–6 săptămâni înainte de petrecere și cere confirmarea cu 1–2 săptămâni înainte.',
        ],
      },
    ],
  },
  Brunch: {
    file: 'ro/invitatii-brunch.html',
    heading: 'Invitații de brunch',
    description:
      'Invitații online de brunch cu clătite, citrice, ceainic și croissant. Adaugă detaliile și trimite linkul pe grupul de WhatsApp.',
    lead: 'Clătite pufoase, felii de citrice, ceai în grădină și cafea cu croissant. Pentru dimineți relaxate de weekend și ocazii speciale.',
    sections: [
      {
        heading: 'Ce să pui pe o invitație de brunch',
        intro: ['Chiar și un brunch relaxat între prieteni are nevoie de câteva repere clare:'],
        list: [
          '<strong>Ocazia.</strong> O zi de naștere, 8 Martie, o întâlnire cu prietenele sau pur și simplu o duminică liniștită.',
          '<strong>Ora de început.</strong> Intervalul 10:00–11:30 este cel mai potrivit pentru brunch.',
          '<strong>Locația.</strong> Acasă dă adresa completă; la bistro sau cafenea trece și numele locului.',
          '<strong>Meniul.</strong> Spune dacă pregătești tu totul sau dacă fiecare aduce ceva bun.',
        ],
      },
      {
        heading: 'Idei de text pentru brunch',
        quotes: [
          'Clătite, cafea tare și companie bună. Hai la un brunch tihnit de duminică.',
          'Brunch de primăvară în grădină cu ceai aromat și prăjitură cu lămâie.',
          'Întâi cafeaua, apoi poveștile. Ne vedem sâmbătă de la ora 10:00.',
        ],
      },
      {
        heading: 'Când să o trimiți',
        paragraphs: [
          'Pentru un brunch acasă sunt suficiente 2 săptămâni înainte. Dacă rezervi o masă la restaurant sau organizezi un brunch de sărbătoare, trimite invitația cu 3–4 săptămâni înainte.',
        ],
      },
    ],
  },
};
