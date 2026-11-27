// The text of each occasion page that scripts/pages.js generates, keyed by template category.
// Every category in public/js/templates.js needs an entry; check-site.js fails when one is missing.
// A section renders intro, list, quotes, then paragraphs. Its strings are trusted HTML written here, so they may hold
// links and inline markup.

export const OCCASIONS = {
  Birthday: {
    file: 'birthday-invitations.html',
    heading: 'Birthday invitations',
    description:
      'Hand-drawn birthday invitation templates with balloons, cake and party hats. Add a photo and the party details, then share a link.',
    lead: 'Balloons, cake, party hats and presents. Pick a design, add the birthday star and the party details, and send it with a link.',
    sections: [
      {
        heading: 'What to put on a birthday invitation',
        intro: [
          'Guests look for three things first: whose birthday it is, when and where. Put the name in the title, such as "Mia turns seven", so the card answers the first question at a glance.',
        ],
        list: [
          '<strong>Who and which birthday.</strong> Name a milestone age. For an adult who would rather not, "Join us to celebrate Sam" works.',
          '<strong>Date, start time and end time.</strong> For children, an end time tells parents when to come back.',
          '<strong>Venue and address.</strong> The invite link adds a map button for the address you type.',
          '<strong>What to expect.</strong> A line about food, games, a theme or a dress code saves you a dozen questions.',
          '<strong>How to reply and by when.</strong> A reply date a week before the party gives you time to order cake.',
        ],
      },
      {
        heading: 'Wording ideas',
        quotes: [
          "You're invited to Mia's seventh birthday. Cake, games and a piñata. Bring your best party hat.",
          'Leo is turning one! Come celebrate his first trip around the sun with us.',
          'Forty and fabulous. Join us for dinner, drinks and dancing in honor of Dana.',
          "Shh, it's a surprise! Arrive by 6:30 so we can all yell together.",
        ],
        paragraphs: [
          'For a surprise party, say so near the top, give an arrival time earlier than the guest of honor, and never send the link to a shared family calendar. The <a href="invitation-wording.html">invitation wording guide</a> has more examples for every line of the card.',
        ],
      },
      {
        heading: 'When to send it',
        paragraphs: [
          'Send birthday invitations two to three weeks ahead. Children\'s parties fill weekends fast, so three weeks is safer during the school year. For a milestone birthday with travel, give guests six weeks. <a href="when-to-send-invitations.html">When to send invitations</a> covers timing for every occasion.',
        ],
      },
    ],
  },
  Wedding: {
    file: 'wedding-invitations.html',
    heading: 'Wedding invitations',
    description:
      'Hand-drawn wedding invitation templates from garden florals and ceremony arches to candlelit velvet galas. Add your details and share a link.',
    lead: 'Garden florals, ceremony arches, tiered cake, sunlit terracotta and dark velvet galas. Add your names, the ceremony details and a photo of the two of you.',
    sections: [
      {
        heading: 'What a wedding invitation says',
        intro: ['Traditional wording follows a fixed order that guests expect:'],
        list: [
          '<strong>The hosts.</strong> Whoever is hosting invites the guests: the couple, their parents, or both families together.',
          '<strong>The request line.</strong> "Request the pleasure of your company" is the classic phrase. "Invite you to celebrate" is lighter.',
          '<strong>The couple.</strong> First names, or full names when the families host.',
          '<strong>Date and time.</strong> Formal cards spell them out; a casual card can use numerals.',
          '<strong>Ceremony venue and address.</strong> If the reception is somewhere else, say so in the note.',
          '<strong>Reply details.</strong> Who to reply to and by when. Ask about dietary needs on the reply, not on the card.',
        ],
      },
      {
        heading: 'Wording ideas',
        quotes: [
          'Together with their families, Lena and Omar request the pleasure of your company as they marry.',
          'Join us as we say I do, then stay for dinner and dancing under the stars.',
          'We eloped! Now let us celebrate with you. Garden party to follow.',
        ],
        paragraphs: [
          'Keep the note short. Dress code, children and plus-ones belong on the invite only when they change who comes or what they wear. Longer details, such as hotels and travel, fit better on a wedding website you link to from the note.',
        ],
      },
      {
        heading: 'When to send it',
        paragraphs: [
          'Send save-the-dates six to eight months ahead, or up to a year for a destination wedding. Send the invitation itself six to eight weeks before the day, with a reply date three to four weeks before it so you can give the caterer final numbers. See <a href="when-to-send-invitations.html">when to send invitations</a> for the full timeline.',
        ],
      },
    ],
  },
  'Baby shower': {
    file: 'baby-shower-invitations.html',
    heading: 'Baby shower invitations',
    description:
      'Hand-drawn baby shower invitation templates with clouds, rubber ducks, bunnies and teddy bears. Add the details and share a link.',
    lead: 'Sleepy clouds, rubber ducks, bunnies and a little bear. Add the parents-to-be, the date and the registry, and send it with a link.',
    sections: [
      {
        heading: 'What to put on a baby shower invitation',
        list: [
          '<strong>Who the shower honors.</strong> "Baby shower for Priya" or "Welcoming baby Rivera" in the title.',
          '<strong>The host.</strong> Showers are usually hosted by a friend or relative, and guests reply to the host.',
          '<strong>Date, time and place.</strong> Two to three hours on a weekend afternoon is typical.',
          '<strong>Registry.</strong> Mention where guests can find it in the note. Some families prefer books or diapers instead of gifts.',
          "<strong>Games or a theme.</strong> If guests should bring something, such as a favorite children's book, say so.",
        ],
      },
      {
        heading: 'Wording ideas',
        quotes: [
          'A little one is on the way! Please join us for a baby shower honoring Priya.',
          "Oh boy! Brunch, games and baby guesses for Sam and Jo's little one.",
          'Bring a book instead of a card, and help us start a library for baby.',
          'Sip and see: come meet baby Ada over tea and cake.',
        ],
      },
      {
        heading: 'When to send it',
        paragraphs: [
          'Showers usually happen four to eight weeks before the due date, so the parent-to-be is comfortable and the baby has not arrived early. Send the invitation four to six weeks before the shower. A sip and see, held after the birth, needs only two to three weeks of notice.',
        ],
      },
    ],
  },
  Brunch: {
    file: 'brunch-invitations.html',
    heading: 'Brunch invitations',
    description:
      'Hand-drawn brunch invitation templates with pancakes, citrus, teapots and croissants. Add the details and share a link.',
    lead: 'Pancake stacks, citrus slices, garden tea and a latte heart. For birthday brunches, bridal brunches, holiday mornings and lazy Sundays.',
    sections: [
      {
        heading: 'What to put on a brunch invitation',
        intro: ['A brunch invite can be casual, but it still needs the essentials:'],
        list: [
          '<strong>The reason, if there is one.</strong> A birthday, a bridal brunch, Mother\'s Day or simply "because it\'s Sunday".',
          '<strong>A start time.</strong> Late morning, between 10:00 and 11:30, is the classic window.',
          '<strong>Where.</strong> At home, give the address. At a restaurant, give the name too, since guests will search for it.',
          '<strong>Food and drink.</strong> Potluck, a set menu or bottomless mimosas. If guests should bring a dish, ask on the card.',
        ],
      },
      {
        heading: 'Wording ideas',
        quotes: [
          'Pancakes, coffee and good company. Join us for a slow Sunday brunch.',
          'Brunch and bubbly to celebrate the bride-to-be.',
          'Rise and shine! Waffles at ours, pajamas optional.',
          "Mother's Day brunch in the garden. Bring your mom, we'll bring the tea.",
        ],
      },
      {
        heading: 'When to send it',
        paragraphs: [
          "Two weeks is plenty for a casual brunch at home. For a restaurant booking, send it three weeks ahead and ask for replies a few days before the booking deadline. Holiday brunches, such as Mother's Day or Easter, fill up early, so give four weeks.",
        ],
      },
    ],
  },
  Graduation: {
    file: 'graduation-invitations.html',
    heading: 'Graduation invitations',
    description:
      'Hand-drawn graduation party invitation templates with tassels, diplomas, books and sunrises. Add a photo and share a link.',
    lead: "Gold tassels, a diploma scroll, a stack of books and a bright sunrise. Add the graduate's photo and the party details.",
    sections: [
      {
        heading: 'Announcement or invitation?',
        paragraphs: [
          'A graduation announcement shares the news. A graduation invitation asks people to a ceremony or a party. Most families send one card that does both: it names the graduate and the school, then invites guests to the celebration afterwards. Ceremony seats are often limited, so invite people to the party and mention the ceremony only to those who have tickets.',
        ],
      },
      {
        heading: 'What to put on a graduation invitation',
        list: [
          '<strong>The graduate and the achievement.</strong> Name, school and class year, such as "Class of 2027".',
          '<strong>A photo.</strong> A cap-and-gown or senior photo makes the card a keepsake.',
          '<strong>Party date, time and place.</strong> Open-house parties often give a window, such as 2:00 to 6:00, so guests can come and go.',
          '<strong>Next steps.</strong> Many families add where the graduate is headed next, such as a college or a first job.',
        ],
      },
      {
        heading: 'Wording ideas',
        quotes: [
          'She did it! Join us to celebrate Maya, Lincoln High Class of 2027.',
          'Open house in honor of our graduate. Stop by any time between 2 and 6.',
          "Caps off to Theo! Dinner and cake to celebrate his master's degree.",
        ],
      },
      {
        heading: 'When to send it',
        paragraphs: [
          "Graduation season packs many parties into a few weekends. Send invitations three to four weeks before the party, and pick a date that does not clash with classmates' parties if you share friends.",
        ],
      },
    ],
  },
  Housewarming: {
    file: 'housewarming-invitations.html',
    heading: 'Housewarming invitations',
    description:
      'Hand-drawn housewarming invitation templates with houseplants, new keys and a cozy window. Add your new address and share a link.',
    lead: 'A terracotta roof, a shelf of plants, a new set of keys and a sleepy cat in the window. Show off the new place.',
    sections: [
      {
        heading: 'What to put on a housewarming invitation',
        list: [
          '<strong>The new address.</strong> This is the one detail guests cannot guess. The invite link gives them a map button.',
          '<strong>Parking and entry.</strong> A buzzer code, which floor, or where to park.',
          '<strong>Date and time.</strong> An open house with a time window suits a home where not everyone fits at once.',
          '<strong>Gifts.</strong> Guests often bring something. If you would rather they did not, say "no gifts, just you".',
          '<strong>Pets and children.</strong> If you have a pet, mention it for guests with allergies.',
        ],
      },
      {
        heading: 'Wording ideas',
        quotes: [
          'New keys, new home, same us. Come see the place!',
          "We've moved! Join us for snacks, drinks and a tour of the new apartment.",
          'Mulled cider, board games and a very friendly cat. Housewarming at ours.',
          'Help us warm up our new home. Open house from 3 to 7, drop by any time.',
        ],
      },
      {
        heading: 'When to send it',
        paragraphs: [
          'Hold the party once the boxes are unpacked, usually one to three months after moving in. Send invitations two to three weeks ahead. The card doubles as your change-of-address note, so you can send it to people who cannot come too.',
        ],
      },
    ],
  },
};
