// Template catalog and the invite renderer shared by the landing page and the editor.
import { UI, normalizeLang } from './i18n.js';
import { RO_TEMPLATE_COPY } from './templates-ro.js';

const sparkle = (x, y, r, fill) =>
  `<path d="M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z" fill="${fill}"/>`;

const leaf = (x, y, rot, fill) =>
  `<ellipse cx="${x}" cy="${y}" rx="8" ry="3.6" transform="rotate(${rot} ${x} ${y})" fill="${fill}"/>`;

const daisy = (x, y, petal, center) => {
  let petals = '';
  for (let a = 0; a < 360; a += 60) {
    petals += `<ellipse cx="${x}" cy="${y - 6}" rx="3.2" ry="6" transform="rotate(${a} ${x} ${y})" fill="${petal}"/>`;
  }
  return `<g>${petals}<circle cx="${x}" cy="${y}" r="3.4" fill="${center}"/></g>`;
};

const rose = (x, y, r, fill, line) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>` +
  `<path d="M${x - r * 0.55} ${y + r * 0.1}a${r * 0.55} ${r * 0.55} 0 1 1 ${r * 0.6} ${r * 0.5}" stroke="${line}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
  `<path d="M${x - r * 0.2} ${y}a${r * 0.25} ${r * 0.25} 0 1 0 ${r * 0.3} -${r * 0.15}" stroke="${line}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;

// A stem from (x1, y1) to the tip (x2, y2) with buds along its top third.
const lavender = (x1, y1, x2, y2) => {
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 90;
  let buds = '';
  for (let i = 0; i < 6; i++) {
    const t = 1 - i * 0.06;
    const side = i % 2 ? 2.4 : -2.4;
    buds += `<ellipse cx="${x1 + (x2 - x1) * t + side}" cy="${y1 + (y2 - y1) * t}" rx="2.6" ry="4.2" transform="rotate(${angle} ${x1 + (x2 - x1) * t + side} ${y1 + (y2 - y1) * t})" fill="${i % 2 ? '#9A86C4' : '#B3A2D6'}"/>`;
  }
  return `<path d="M${x1} ${y1}L${x2} ${y2}" stroke="#7F9A72" stroke-width="1.6"/>${buds}`;
};

const citrus = (x, y, r, rind, flesh) => {
  let segments = '';
  for (let a = 0; a < 180; a += 45) {
    segments += `<path d="M${x} ${y - r + 5}V${y + r - 5}" stroke="#FFF8E0" stroke-width="1.4" transform="rotate(${a} ${x} ${y})"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${rind}"/><circle cx="${x}" cy="${y}" r="${r - 3}" fill="#FFF8E0"/><circle cx="${x}" cy="${y}" r="${r - 5}" fill="${flesh}"/>${segments}`;
};

const key = (rot, fill, hole) => `
  <g transform="rotate(${rot} 100 60)">
    <rect x="97" y="88" width="6" height="44" rx="2" fill="${fill}"/>
    <rect x="103" y="116" width="9" height="4" rx="1" fill="${fill}"/><rect x="103" y="124" width="6" height="4" rx="1" fill="${fill}"/>
    <circle cx="100" cy="80" r="11" fill="${fill}"/><circle cx="100" cy="80" r="4" fill="${hole}"/>
  </g>`;

const svg = (body) =>
  `<svg viewBox="0 0 200 160" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${body}</svg>`;

export const TEMPLATES = [
  {
    id: 'birthday',
    name: 'Balloon Bash',
    category: 'Birthday',
    tagline: 'Bright, bouncy, full of cake.',
    frame: 'blob',
    titleFont: 'display',
    colors: { bg: '#FCEDEA', ink: '#5A3A35', accent: '#A44E47', soft: '#F7DAD5' },
    defaults: {
      eyebrow: "You're invited to",
      title: 'Mia turns seven',
      hosts: 'Join Mia and her family',
      date: '2026-12-12',
      time: '14:00',
      venue: 'Willow Park Pavilion',
      address: '24 Willow Lane, Portland',
      message: 'Cake, games and a piñata. Bring your best party hat.',
      rsvp: 'RSVP to Ana by December 5',
    },
    art: svg(`
      <g stroke="#B9897F" stroke-width="1.4" fill="none">
        <path d="M60 87Q54 104 74 118"/><path d="M102 67Q97 92 100 114"/><path d="M142 82Q150 100 126 118"/>
      </g>
      <ellipse cx="60" cy="56" rx="21" ry="26" fill="#EC9C93"/><path d="M60 82l-4 5h8z" fill="#EC9C93"/>
      <ellipse cx="102" cy="38" rx="19" ry="24" fill="#F2C66D"/><path d="M102 62l-4 5h8z" fill="#F2C66D"/>
      <ellipse cx="142" cy="52" rx="20" ry="25" fill="#9FBF96"/><path d="M142 77l-4 5h8z" fill="#9FBF96"/>
      <ellipse cx="52" cy="46" rx="4.5" ry="8" transform="rotate(20 52 46)" fill="#fff" opacity=".5"/>
      <ellipse cx="95" cy="29" rx="4" ry="7" transform="rotate(20 95 29)" fill="#fff" opacity=".5"/>
      <ellipse cx="134" cy="42" rx="4" ry="7.5" transform="rotate(20 134 42)" fill="#fff" opacity=".5"/>
      <rect x="66" y="116" width="68" height="34" rx="6" fill="#FFF8F1" stroke="#E5C9BC" stroke-width="1.5"/>
      <path d="M66 128V124Q66 116 74 116H126Q134 116 134 124V128q-5 6-10 0q-5 6-10 0q-5 6-10 0q-5 6-10 0q-5 6-10 0q-5 6-10 0q-4 5-8 0Z" fill="#F3B8B0"/>
      <rect x="86" y="102" width="5" height="14" rx="2" fill="#9FBF96"/>
      <rect x="97.5" y="100" width="5" height="16" rx="2" fill="#EC9C93"/>
      <rect x="109" y="102" width="5" height="14" rx="2" fill="#F2C66D"/>
      <ellipse cx="88.5" cy="97" rx="2.4" ry="4" fill="#F2A65A"/>
      <ellipse cx="100" cy="95" rx="2.4" ry="4" fill="#F2A65A"/>
      <ellipse cx="111.5" cy="97" rx="2.4" ry="4" fill="#F2A65A"/>
      <circle cx="80" cy="140" r="2" fill="#9FBF96"/><circle cx="100" cy="138" r="2" fill="#F2C66D"/><circle cx="120" cy="140" r="2" fill="#EC9C93"/>
      ${sparkle(24, 30, 6, '#F2C66D')}${sparkle(176, 110, 5, '#EC9C93')}${sparkle(30, 120, 4, '#9FBF96')}${sparkle(176, 22, 4, '#F2C66D')}
    `),
  },
  {
    id: 'wedding',
    name: 'Sage Vows',
    category: 'Wedding',
    tagline: 'Soft greenery and golden rings.',
    frame: 'arch',
    titleFont: 'serif',
    colors: { bg: '#F4F2E8', ink: '#3E4A39', accent: '#52704C', soft: '#E3EADB' },
    defaults: {
      eyebrow: 'Together with their families',
      title: 'Elena & Tomas',
      hosts: 'request the pleasure of your company',
      date: '2027-06-19',
      time: '16:30',
      venue: 'The Orchard House',
      address: '118 Cedar Hill Road, Hudson, NY',
      message: 'Ceremony in the garden, followed by dinner and dancing.',
      rsvp: 'Kindly reply by May 1',
    },
    art: svg(`
      <path d="M34 150Q54 108 42 58" stroke="#8FA886" stroke-width="2" fill="none"/>
      ${leaf(40, 132, -60, '#93AE87')}${leaf(52, 120, 30, '#A9C29D')}${leaf(44, 104, -50, '#93AE87')}
      ${leaf(56, 92, 40, '#A9C29D')}${leaf(44, 78, -70, '#93AE87')}${leaf(52, 64, 50, '#A9C29D')}
      <path d="M166 150Q146 108 158 58" stroke="#8FA886" stroke-width="2" fill="none"/>
      ${leaf(160, 132, 60, '#93AE87')}${leaf(148, 120, -30, '#A9C29D')}${leaf(156, 104, 50, '#93AE87')}
      ${leaf(144, 92, -40, '#A9C29D')}${leaf(156, 78, 70, '#93AE87')}${leaf(148, 64, -50, '#A9C29D')}
      <circle cx="87" cy="98" r="25" fill="none" stroke="#D4AE62" stroke-width="6"/>
      <circle cx="113" cy="98" r="25" fill="none" stroke="#C69C4E" stroke-width="6"/>
      <path d="M87 60l7 7-7 9-7-9z" fill="#FFFFFF" stroke="#C69C4E" stroke-width="1.5"/>
      ${sparkle(100, 36, 6, '#D4AE62')}${sparkle(72, 46, 3.5, '#C69C4E')}${sparkle(128, 50, 4, '#D4AE62')}
      ${daisy(40, 150, '#FFFFFF', '#E0B45C')}${daisy(160, 150, '#FFFFFF', '#E0B45C')}
    `),
  },
  {
    id: 'baby',
    name: 'Little Moon',
    category: 'Baby shower',
    tagline: 'Sleepy clouds and starlight.',
    frame: 'circle',
    titleFont: 'display',
    colors: { bg: '#EDF2F7', ink: '#36425C', accent: '#4F6993', soft: '#DCE5F0' },
    defaults: {
      eyebrow: 'Please join us for a baby shower',
      title: 'Oh baby, Noa!',
      hosts: 'honoring Sara and Jon',
      date: '2027-02-06',
      time: '11:00',
      venue: 'Hazel & Rye Café',
      address: '9 Juniper Street, Seattle',
      message: 'Brunch, tiny socks and sweet wishes for the little one.',
      rsvp: 'RSVP to Lena by January 25',
    },
    art: svg(`
      <circle cx="122" cy="62" r="34" fill="#F2D58A"/>
      <circle cx="139" cy="51" r="30" fill="#DCE5F0"/>
      <circle cx="112" cy="70" r="3" fill="#E5C16C"/><circle cx="104" cy="56" r="2" fill="#E5C16C"/>
      <path d="M68 18V44" stroke="#AFC0D8" stroke-width="1.2"/>${sparkle(68, 50, 7, '#F2D58A')}
      <path d="M48 18V30" stroke="#AFC0D8" stroke-width="1.2"/>${sparkle(48, 35, 5, '#FFFFFF')}
      <g fill="#FFFFFF">
        <circle cx="72" cy="114" r="18"/><circle cx="96" cy="104" r="23"/><circle cx="122" cy="114" r="17"/>
        <rect x="54" y="112" width="86" height="20" rx="10"/>
      </g>
      <circle cx="88" cy="114" r="1.8" fill="#36425C"/><circle cx="104" cy="114" r="1.8" fill="#36425C"/>
      <path d="M92 121q4 3 8 0" stroke="#36425C" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <circle cx="82" cy="120" r="3" fill="#F3C6C0" opacity=".8"/><circle cx="110" cy="120" r="3" fill="#F3C6C0" opacity=".8"/>
      ${sparkle(168, 104, 5, '#FFFFFF')}${sparkle(30, 90, 4, '#F2D58A')}${sparkle(160, 138, 3.5, '#F2D58A')}${sparkle(36, 140, 3, '#FFFFFF')}
    `),
  },
  {
    id: 'brunch',
    name: 'Garden Tea',
    category: 'Brunch',
    tagline: 'Daisies, teapots, slow mornings.',
    frame: 'rect',
    titleFont: 'serif',
    colors: { bg: '#FBF4E2', ink: '#56432E', accent: '#8A5F18', soft: '#F4E7C6' },
    defaults: {
      eyebrow: 'Come for tea and cake',
      title: 'Spring garden brunch',
      hosts: 'hosted by Margot',
      date: '2027-04-17',
      time: '10:30',
      venue: "Margot's back garden",
      address: '41 Primrose Avenue, Bath',
      message: 'Scones, lemon cake and the first flowers of the year.',
      rsvp: 'Text Margot by April 10',
    },
    art: svg(`
      <path d="M150 74q6-8 0-16q-6-8 0-16" stroke="#D8B77A" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <path d="M162 76q6-8 0-16q-6-8 0-16" stroke="#D8B77A" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".6"/>
      <path d="M56 92Q32 98 44 120Q50 126 58 118" fill="none" stroke="#D8B77A" stroke-width="5" stroke-linecap="round"/>
      <path d="M128 98Q150 96 156 80L163 82Q158 110 132 118Z" fill="#FFFAF0" stroke="#D8B77A" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="92" cy="106" rx="40" ry="32" fill="#FFFAF0" stroke="#D8B77A" stroke-width="2"/>
      <path d="M68 80Q92 62 116 80Z" fill="#E8A9A0" stroke="#D8B77A" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="92" cy="68" r="5" fill="#E8A9A0" stroke="#D8B77A" stroke-width="2"/>
      <path d="M54 108Q92 122 130 108" stroke="#9FBF96" stroke-width="4" fill="none"/>
      ${daisy(80, 96, '#FFFFFF', '#F2C66D')}${daisy(104, 94, '#F3B8B0', '#F2C66D')}
      <ellipse cx="92" cy="140" rx="54" ry="5" fill="#E9D7A9" opacity=".7"/>
      ${daisy(28, 36, '#FFFFFF', '#F2C66D')}${daisy(176, 130, '#FFFFFF', '#F2C66D')}${daisy(24, 136, '#F3B8B0', '#F2C66D')}
      ${leaf(38, 46, 40, '#9FBF96')}${leaf(166, 140, -30, '#9FBF96')}
      ${sparkle(176, 30, 4, '#E0B45C')}
    `),
  },
  {
    id: 'graduation',
    name: 'Gold Tassel',
    category: 'Graduation',
    tagline: 'Evergreen, cream and a touch of gold.',
    frame: 'rect',
    titleFont: 'display',
    dark: true,
    colors: { bg: '#2F3D35', ink: '#F6EFE0', accent: '#E2C27A', soft: '#3B4B41' },
    defaults: {
      eyebrow: 'Celebrate the class of 2027',
      title: "Leo's graduation party",
      hosts: 'with the Okafor family',
      date: '2027-06-05',
      time: '18:00',
      venue: 'The Okafor home',
      address: '77 Maple Court, Austin, TX',
      message: 'Dinner, speeches and a slideshow you will not want to miss.',
      rsvp: 'RSVP to Grace by May 28',
    },
    art: svg(`
      <path d="M66 74V100Q100 118 134 100V74L100 88Z" fill="#1E2822"/>
      <path d="M100 38L166 62L100 86L34 62Z" fill="#26332C" stroke="#E2C27A" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="100" cy="62" r="3.5" fill="#E2C27A"/>
      <path d="M100 62Q128 68 146 72V104" stroke="#E2C27A" stroke-width="2" fill="none"/>
      <path d="M142 102h8l2 18h-12z" fill="#E2C27A"/>
      <rect x="44" y="122" width="88" height="16" rx="8" fill="#F6EFE0"/>
      <circle cx="132" cy="130" r="8" fill="#E9E0CC"/>
      <rect x="82" y="119" width="8" height="22" fill="#D98E88"/>
      ${sparkle(30, 30, 6, '#E2C27A')}${sparkle(172, 28, 4, '#F6EFE0')}${sparkle(170, 136, 5, '#E2C27A')}${sparkle(26, 104, 3.5, '#F6EFE0')}
      <circle cx="52" cy="40" r="2" fill="#D98E88"/><circle cx="158" cy="100" r="2" fill="#9FBF96"/><circle cx="40" cy="80" r="2" fill="#E2C27A"/>
    `),
  },
  {
    id: 'housewarming',
    name: 'Home Sweet',
    category: 'Housewarming',
    tagline: 'Terracotta roof, warm windows.',
    frame: 'arch',
    titleFont: 'display',
    colors: { bg: '#F7EBDF', ink: '#573A2A', accent: '#95532F', soft: '#EFDACA' },
    defaults: {
      eyebrow: 'We finally have a porch',
      title: 'Come warm our new home',
      hosts: 'love, Priya and Sam',
      date: '2026-11-21',
      time: '19:00',
      venue: 'Our new place',
      address: '3 Birch Row, Apt 2, Denver',
      message: 'Snacks, drinks and a grand tour of all four rooms.',
      rsvp: 'Let us know by November 14',
    },
    art: svg(`
      <circle cx="130" cy="34" r="5" fill="#FFFFFF" opacity=".8"/><circle cx="138" cy="24" r="7" fill="#FFFFFF" opacity=".7"/>
      <rect x="124" y="44" width="12" height="24" rx="2" fill="#A9654A"/>
      <rect x="60" y="74" width="80" height="66" rx="4" fill="#FBF3EA" stroke="#C99577" stroke-width="2"/>
      <path d="M50 80L100 38L150 80Z" fill="#C27A55" stroke="#C27A55" stroke-width="6" stroke-linejoin="round"/>
      <path d="M100 58c-3-4-9-2-9 2.5c0 4 9 9 9 9s9-5 9-9c0-4.5-6-6.5-9-2.5z" fill="#F3C6C0"/>
      <rect x="68" y="88" width="18" height="18" rx="2" fill="#F2D58A" stroke="#C99577" stroke-width="1.5"/>
      <rect x="114" y="88" width="18" height="18" rx="2" fill="#F2D58A" stroke="#C99577" stroke-width="1.5"/>
      <path d="M77 88V106M68 97H86M123 88V106M114 97H132" stroke="#C99577" stroke-width="1.2"/>
      <path d="M90 140V114Q100 104 110 114V140Z" fill="#9FBF96"/>
      <circle cx="105" cy="126" r="1.8" fill="#FBF3EA"/>
      <path d="M150 128h20l-3 14h-14z" fill="#C27A55"/>
      ${leaf(156, 120, -60, '#93AE87')}${leaf(164, 118, 60, '#A9C29D')}${leaf(160, 110, 0, '#93AE87')}
      <path d="M20 142H180" stroke="#C99577" stroke-width="2" stroke-linecap="round"/>
      ${daisy(36, 134, '#FFFFFF', '#F2C66D')}${sparkle(34, 40, 5, '#F2D58A')}${sparkle(172, 60, 4, '#FFFFFF')}
    `),
  },
  {
    id: 'sprinkle-cake',
    name: 'Sprinkle Cake',
    category: 'Birthday',
    tagline: 'Three tiers and a mint plate.',
    frame: 'rect',
    titleFont: 'display',
    colors: { bg: '#E9F3EE', ink: '#2F4A41', accent: '#356B59', soft: '#D3E8DE' },
    defaults: {
      title: 'Theo is turning 30',
      hosts: 'drinks are on Theo',
      date: '2027-03-13',
      time: '20:00',
      venue: 'The Copper Room',
      address: '210 King Street, Toronto',
      rsvp: 'RSVP to Theo by March 6',
    },
    art: svg(`
      <ellipse cx="100" cy="144" rx="58" ry="6" fill="#BFD9CD"/>
      <rect x="56" y="112" width="88" height="30" rx="6" fill="#FFFFFF" stroke="#E9C7C3" stroke-width="1.5"/>
      <rect x="66" y="86" width="68" height="28" rx="6" fill="#F6C9C4"/>
      <path d="M66 92Q66 86 72 86H128Q134 86 134 92V95q-4 7-8 0q-4 9-9 0q-4 6-8 0q-4 9-9 0q-4 6-8 0q-4 9-9 0q-4 6-8 0q-4 7-9 0Z" fill="#FFFFFF"/>
      <rect x="76" y="62" width="48" height="26" rx="6" fill="#FFFFFF" stroke="#E9C7C3" stroke-width="1.5"/>
      <rect x="97" y="42" width="6" height="20" rx="2" fill="#F2C66D"/><ellipse cx="100" cy="37" rx="3" ry="5" fill="#F2A65A"/>
      <g>
        <rect x="68" y="122" width="7" height="2.4" rx="1.2" transform="rotate(30 71 123)" fill="#356B59"/>
        <rect x="88" y="130" width="7" height="2.4" rx="1.2" transform="rotate(-20 91 131)" fill="#EC9C93"/>
        <rect x="108" y="121" width="7" height="2.4" rx="1.2" transform="rotate(50 111 122)" fill="#F2C66D"/>
        <rect x="126" y="131" width="7" height="2.4" rx="1.2" transform="rotate(-40 129 132)" fill="#7F9CC4"/>
        <rect x="86" y="72" width="7" height="2.4" rx="1.2" transform="rotate(-30 89 73)" fill="#EC9C93"/>
        <rect x="106" y="76" width="7" height="2.4" rx="1.2" transform="rotate(40 109 77)" fill="#356B59"/>
        <rect x="80" y="104" width="7" height="2.4" rx="1.2" transform="rotate(20 83 105)" fill="#FFFFFF"/>
        <rect x="112" y="102" width="7" height="2.4" rx="1.2" transform="rotate(-30 115 103)" fill="#F2C66D"/>
      </g>
      ${sparkle(30, 40, 6, '#F2C66D')}${sparkle(170, 60, 5, '#EC9C93')}${sparkle(160, 24, 3.5, '#356B59')}${sparkle(34, 116, 4, '#7F9CC4')}
    `),
  },
  {
    id: 'party-hats',
    name: 'Party Hats',
    category: 'Birthday',
    tagline: 'Pompoms, streamers, confetti.',
    frame: 'blob',
    titleFont: 'display',
    colors: { bg: '#F2EDF8', ink: '#45385E', accent: '#5F4890', soft: '#E1D8F0' },
    defaults: {
      eyebrow: 'Hats on, it is party time',
      title: "Lily's big 5",
      hosts: 'with love from Mom and Dad',
      date: '2027-01-23',
      time: '15:00',
      venue: 'Jump Street Play Center',
      address: '58 Oak Boulevard, Chicago',
      message: 'Bouncy castle, pizza and plenty of cupcakes.',
      rsvp: 'RSVP to Kate by January 16',
    },
    art: svg(`
      <path d="M14 34q14-14 28 0t28 0t28 0" stroke="#5F4890" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M110 26q14-14 28 0t28 0t28 0" stroke="#EC9C93" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M66 136L90 52L114 136Z" fill="#F3B8B0"/>
      <path d="M83 78H97M78 100H102M73 122H107" stroke="#FFFFFF" stroke-width="5" opacity=".85"/>
      <circle cx="90" cy="50" r="8" fill="#F2C66D"/>
      <g transform="rotate(18 140 132)">
        <path d="M124 136L140 76L156 136Z" fill="#9FBF96"/>
        <path d="M134 96H146M130 114H150" stroke="#FFFFFF" stroke-width="4" opacity=".85"/>
        <circle cx="140" cy="74" r="6" fill="#EC9C93"/>
      </g>
      <circle cx="40" cy="80" r="3" fill="#F2C66D"/><circle cx="160" cy="58" r="2.5" fill="#5F4890"/><circle cx="34" cy="128" r="2.5" fill="#EC9C93"/>
      <rect x="46" y="104" width="6" height="2.4" rx="1.2" transform="rotate(40 49 105)" fill="#9FBF96"/>
      <rect x="170" y="100" width="6" height="2.4" rx="1.2" transform="rotate(-30 173 101)" fill="#F2C66D"/>
      ${sparkle(56, 64, 5, '#5F4890')}${sparkle(172, 130, 5, '#F2C66D')}${sparkle(122, 54, 3.5, '#EC9C93')}
    `),
  },
  {
    id: 'gift-wrapped',
    name: 'Gift Wrapped',
    category: 'Birthday',
    tagline: 'A pile of presents and bows.',
    frame: 'circle',
    titleFont: 'serif',
    colors: { bg: '#FDF1E6', ink: '#5B3A28', accent: '#9A4F2E', soft: '#F6DCC8' },
    defaults: {
      eyebrow: 'Shh, it is a surprise',
      title: "Sam's surprise party",
      hosts: 'please keep it quiet',
      date: '2027-05-08',
      time: '19:30',
      venue: 'Rosie and Ben’s place',
      address: '15 Harbor View, San Diego',
      message: 'Arrive by 7:15 so we can all shout surprise together.',
      rsvp: 'Text Rosie by May 1',
    },
    art: svg(`
      <rect x="56" y="92" width="64" height="48" rx="4" fill="#C9785A"/>
      <rect x="52" y="82" width="72" height="14" rx="3" fill="#D98D6E"/>
      <rect x="84" y="82" width="8" height="58" fill="#F2D58A"/>
      <ellipse cx="80" cy="76" rx="11" ry="6" transform="rotate(-25 80 76)" fill="none" stroke="#F2D58A" stroke-width="4"/>
      <ellipse cx="96" cy="76" rx="11" ry="6" transform="rotate(25 96 76)" fill="none" stroke="#F2D58A" stroke-width="4"/>
      <rect x="120" y="110" width="40" height="30" rx="3" fill="#9FBF96"/>
      <rect x="117" y="103" width="46" height="10" rx="2" fill="#B5D0AC"/>
      <rect x="137" y="103" width="6" height="37" fill="#F3B8B0"/>
      <ellipse cx="134" cy="99" rx="7" ry="4" transform="rotate(-25 134 99)" fill="none" stroke="#F3B8B0" stroke-width="3"/>
      <ellipse cx="146" cy="99" rx="7" ry="4" transform="rotate(25 146 99)" fill="none" stroke="#F3B8B0" stroke-width="3"/>
      <rect x="28" y="120" width="28" height="20" rx="3" fill="#F3B8B0"/>
      <rect x="39" y="120" width="5" height="20" fill="#FFFFFF" opacity=".8"/>
      <path d="M20 140H180" stroke="#E3C1A8" stroke-width="2" stroke-linecap="round"/>
      ${sparkle(140, 60, 6, '#F2C66D')}${sparkle(40, 70, 5, '#C9785A')}${sparkle(166, 84, 3.5, '#9FBF96')}${sparkle(104, 40, 4, '#F2C66D')}
    `),
  },
  {
    id: 'blush-roses',
    name: 'Blush Roses',
    category: 'Wedding',
    tagline: 'A bouquet of garden roses.',
    frame: 'arch',
    titleFont: 'serif',
    colors: { bg: '#FBF0EF', ink: '#5A3A3C', accent: '#97505A', soft: '#F4DADB' },
    defaults: {
      title: 'Ines & David',
      date: '2027-09-11',
      time: '15:00',
      venue: 'Villa Rosa',
      address: 'Via dei Fiori 12, Florence',
      rsvp: 'Kindly reply by July 31',
    },
    art: svg(`
      ${leaf(56, 110, -30, '#93AE87')}${leaf(144, 112, 30, '#93AE87')}${leaf(60, 78, -60, '#A9C29D')}${leaf(142, 80, 60, '#A9C29D')}
      ${leaf(84, 126, 70, '#93AE87')}${leaf(118, 128, -70, '#A9C29D')}
      ${rose(72, 96, 16, '#F2C3C2', '#C98589')}${rose(128, 98, 17, '#F2C3C2', '#C98589')}
      ${rose(100, 80, 22, '#E8A3A6', '#B86A70')}${rose(98, 114, 13, '#E8A3A6', '#B86A70')}
      <circle cx="56" cy="64" r="3" fill="#FFFFFF"/><circle cx="148" cy="62" r="3" fill="#FFFFFF"/><circle cx="64" cy="132" r="2.5" fill="#FFFFFF"/>
      ${sparkle(100, 38, 5, '#D4AE62')}${sparkle(36, 92, 3.5, '#D4AE62')}${sparkle(166, 94, 3.5, '#D4AE62')}
    `),
  },
  {
    id: 'midnight-garden',
    name: 'Midnight Garden',
    category: 'Wedding',
    tagline: 'Navy sky, gold moon, white blooms.',
    frame: 'circle',
    titleFont: 'serif',
    dark: true,
    colors: { bg: '#26304A', ink: '#F3EEE2', accent: '#D9B96B', soft: '#323E5C' },
    defaults: {
      title: 'Amara & Kofi',
      hosts: 'invite you to dance under the stars',
      date: '2027-08-21',
      time: '19:00',
      venue: 'Starlight Conservatory',
      address: '400 Garden Way, Atlanta',
      message: 'An evening ceremony, dinner by candlelight and dancing until late.',
      rsvp: 'Kindly reply by July 10',
    },
    art: svg(`
      <circle cx="130" cy="54" r="22" fill="#E9D49A"/><circle cx="141" cy="47" r="19" fill="#323E5C"/>
      ${sparkle(60, 36, 5, '#E9D49A')}${sparkle(90, 24, 3, '#FFFFFF')}${sparkle(162, 88, 4, '#FFFFFF')}${sparkle(40, 72, 3, '#FFFFFF')}${sparkle(100, 56, 2.5, '#E9D49A')}
      <path d="M60 160Q66 124 52 96M100 160Q102 120 96 92M140 160Q136 126 150 100" stroke="#6E8F7A" stroke-width="2" fill="none"/>
      ${leaf(58, 124, -60, '#5E7D6A')}${leaf(52, 110, 30, '#6E8F7A')}${leaf(102, 126, 60, '#5E7D6A')}${leaf(94, 110, -40, '#6E8F7A')}
      ${leaf(140, 130, 50, '#5E7D6A')}${leaf(146, 114, -30, '#6E8F7A')}
      ${daisy(52, 94, '#FFFFFF', '#D9B96B')}${daisy(96, 90, '#FFFFFF', '#D9B96B')}${daisy(150, 98, '#FFFFFF', '#D9B96B')}
    `),
  },
  {
    id: 'lavender-fields',
    name: 'Lavender Fields',
    category: 'Wedding',
    tagline: 'A tied bundle of lavender.',
    frame: 'rect',
    titleFont: 'serif',
    colors: { bg: '#F3F0F8', ink: '#433C57', accent: '#5E4F88', soft: '#E3DDF0' },
    defaults: {
      title: 'June & Marco',
      hosts: 'are getting married',
      date: '2027-07-03',
      time: '17:00',
      venue: 'Les Champs Farm',
      address: 'Route de Sault, Provence',
      message: 'An outdoor ceremony among the lavender, then dinner at long tables.',
      rsvp: 'Please reply by May 15',
    },
    art: svg(`
      ${lavender(100, 140, 62, 40)}${lavender(100, 140, 80, 30)}${lavender(100, 140, 100, 24)}${lavender(100, 140, 120, 30)}${lavender(100, 140, 138, 40)}
      ${lavender(100, 140, 72, 52)}${lavender(100, 140, 128, 52)}
      <ellipse cx="90" cy="116" rx="11" ry="6" transform="rotate(-20 90 116)" fill="none" stroke="#E8A9A0" stroke-width="3.5"/>
      <ellipse cx="110" cy="116" rx="11" ry="6" transform="rotate(20 110 116)" fill="none" stroke="#E8A9A0" stroke-width="3.5"/>
      <path d="M98 119L88 140M102 119L112 140" stroke="#E8A9A0" stroke-width="3.5" stroke-linecap="round"/>
      ${sparkle(36, 40, 5, '#D4AE62')}${sparkle(168, 60, 4, '#D4AE62')}${sparkle(40, 120, 3.5, '#9A86C4')}${sparkle(164, 128, 3.5, '#9A86C4')}
    `),
  },
  {
    id: 'duckling',
    name: 'Rubber Duck',
    category: 'Baby shower',
    tagline: 'Bath time, bubbles, sunshine yellow.',
    frame: 'circle',
    titleFont: 'display',
    colors: { bg: '#FFF8DE', ink: '#5A4A22', accent: '#82610E', soft: '#FBEBB5' },
    defaults: {
      title: 'A little duck is on the way',
      hosts: 'honoring Maya',
      date: '2027-03-20',
      time: '13:00',
      venue: 'The Sunroom',
      address: '88 Brook Lane, Austin',
      rsvp: 'RSVP to Jess by March 12',
    },
    art: svg(`
      <circle cx="150" cy="44" r="7" fill="none" stroke="#FFFFFF" stroke-width="2"/><circle cx="164" cy="64" r="4" fill="none" stroke="#FFFFFF" stroke-width="2"/><circle cx="40" cy="54" r="5" fill="none" stroke="#FFFFFF" stroke-width="2"/>
      <path d="M132 98l14-12-4 20z" fill="#F7C948"/>
      <ellipse cx="102" cy="104" rx="36" ry="21" fill="#F7C948"/>
      <circle cx="82" cy="74" r="18" fill="#F7C948"/>
      <path d="M66 74q-12 2-14 7q9 5 16 0z" fill="#EE8A3C"/>
      <circle cx="78" cy="69" r="2.6" fill="#3D2F27"/><circle cx="88" cy="78" r="3.4" fill="#F3B8B0" opacity=".8"/>
      <path d="M102 96q16-8 26 4q-10 12-26 4z" fill="#EBB52E"/>
      <path d="M0 118q12-8 25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0V160H0Z" fill="#A9CBE0"/>
      <path d="M0 132q12-8 25 0t25 0t25 0t25 0t25 0t25 0t25 0t25 0V160H0Z" fill="#8FB8D3"/>
      ${sparkle(30, 96, 4, '#FFFFFF')}${sparkle(170, 100, 5, '#FFFFFF')}
    `),
  },
  {
    id: 'bunny-hop',
    name: 'Bunny Hop',
    category: 'Baby shower',
    tagline: 'Floppy ears and a garden of blooms.',
    frame: 'arch',
    titleFont: 'display',
    colors: { bg: '#FCEEEF', ink: '#5C3B40', accent: '#954A5C', soft: '#F5D8DC' },
    defaults: {
      title: 'Some bunny is coming',
      hosts: 'a shower for Olivia',
      date: '2027-04-10',
      time: '12:00',
      venue: 'Peony Tea House',
      address: '7 Bloom Street, Boston',
      rsvp: 'RSVP to Nina by April 2',
    },
    art: svg(`
      <ellipse cx="84" cy="44" rx="10" ry="28" transform="rotate(-10 84 44)" fill="#FFFFFF" stroke="#E2B9BF" stroke-width="1.5"/>
      <ellipse cx="116" cy="44" rx="10" ry="28" transform="rotate(10 116 44)" fill="#FFFFFF" stroke="#E2B9BF" stroke-width="1.5"/>
      <ellipse cx="84" cy="46" rx="4.5" ry="19" transform="rotate(-10 84 46)" fill="#F3B8C0"/>
      <ellipse cx="116" cy="46" rx="4.5" ry="19" transform="rotate(10 116 46)" fill="#F3B8C0"/>
      <ellipse cx="100" cy="94" rx="34" ry="30" fill="#FFFFFF" stroke="#E2B9BF" stroke-width="1.5"/>
      <circle cx="88" cy="88" r="3" fill="#3D2F27"/><circle cx="112" cy="88" r="3" fill="#3D2F27"/>
      <path d="M96 97h8l-4 4z" fill="#E8A0AC"/>
      <path d="M100 101v4M100 105q-4 4-8 1M100 105q4 4 8 1" stroke="#5C3B40" stroke-width="1.4" fill="none" stroke-linecap="round"/>
      <circle cx="80" cy="100" r="4.5" fill="#F3B8C0" opacity=".8"/><circle cx="120" cy="100" r="4.5" fill="#F3B8C0" opacity=".8"/>
      ${daisy(40, 136, '#FFFFFF', '#F2C66D')}${daisy(160, 134, '#F3B8C0', '#F2C66D')}${daisy(130, 146, '#FFFFFF', '#F2C66D')}${daisy(68, 148, '#F3B8C0', '#F2C66D')}
      ${leaf(52, 146, -40, '#9FBF96')}${leaf(148, 146, 40, '#9FBF96')}
      ${sparkle(150, 40, 5, '#F2C66D')}${sparkle(46, 60, 4, '#E8A0AC')}
    `),
  },
  {
    id: 'little-bear',
    name: 'Little Bear',
    category: 'Baby shower',
    tagline: 'A teddy holding a balloon.',
    frame: 'blob',
    titleFont: 'serif',
    colors: { bg: '#F4EEE5', ink: '#4F3D2E', accent: '#7A5636', soft: '#E8DCCB' },
    defaults: {
      title: 'Beary excited for baby Leo',
      hosts: 'a shower for Hana and Ken',
      date: '2027-02-27',
      time: '14:00',
      venue: 'Maple Hall',
      address: '302 Elm Avenue, Minneapolis',
      rsvp: 'RSVP to Aiko by February 20',
    },
    art: svg(`
      <path d="M150 60Q142 86 130 108" stroke="#B9897F" stroke-width="1.4" fill="none"/>
      <ellipse cx="150" cy="40" rx="16" ry="20" fill="#E8A9A0"/><path d="M150 60l-3 4h6z" fill="#E8A9A0"/>
      <ellipse cx="144" cy="33" rx="3.5" ry="6" transform="rotate(20 144 33)" fill="#FFFFFF" opacity=".5"/>
      <circle cx="74" cy="56" r="12" fill="#C29468"/><circle cx="126" cy="56" r="12" fill="#C29468"/>
      <circle cx="74" cy="56" r="6" fill="#E3C3A0"/><circle cx="126" cy="56" r="6" fill="#E3C3A0"/>
      <ellipse cx="100" cy="132" rx="32" ry="24" fill="#C29468"/><ellipse cx="100" cy="136" rx="17" ry="14" fill="#E3C3A0"/>
      <circle cx="100" cy="80" r="30" fill="#C29468"/>
      <ellipse cx="100" cy="92" rx="13" ry="10" fill="#E8D2B4"/><ellipse cx="100" cy="87" rx="4.5" ry="3.2" fill="#3D2F27"/>
      <path d="M100 90v4q-4 4-7 1M100 94q4 4 7 1" stroke="#3D2F27" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <circle cx="88" cy="76" r="2.8" fill="#3D2F27"/><circle cx="112" cy="76" r="2.8" fill="#3D2F27"/>
      <circle cx="130" cy="112" r="8" fill="#C29468"/><circle cx="70" cy="116" r="8" fill="#C29468"/>
      ${sparkle(40, 40, 5, '#E0B45C')}${sparkle(170, 100, 4, '#E0B45C')}${sparkle(36, 120, 3.5, '#FFFFFF')}
    `),
  },
  {
    id: 'pancake-stack',
    name: 'Pancake Stack',
    category: 'Brunch',
    tagline: 'Butter, syrup, fresh berries.',
    frame: 'rect',
    titleFont: 'display',
    colors: { bg: '#FFF5E5', ink: '#5A3E22', accent: '#8A5413', soft: '#F8E2BE' },
    defaults: {
      eyebrow: 'Rise and shine',
      title: 'Pancake Sunday',
      hosts: 'flipped by Jonah',
      date: '2027-03-07',
      time: '10:00',
      venue: "Jonah's kitchen",
      address: '19 Laurel Street, Portland',
      message: 'Stacks of pancakes, strong coffee and a lazy morning.',
      rsvp: 'Text Jonah by March 3',
    },
    art: svg(`
      <ellipse cx="100" cy="140" rx="62" ry="8" fill="#FFFFFF" stroke="#E4CDA6" stroke-width="1.5"/>
      <rect x="54" y="120" width="92" height="15" rx="7.5" fill="#E2A75E"/>
      <rect x="56" y="106" width="88" height="15" rx="7.5" fill="#E9B36B"/>
      <rect x="54" y="92" width="92" height="15" rx="7.5" fill="#E2A75E"/>
      <rect x="57" y="78" width="86" height="15" rx="7.5" fill="#E9B36B"/>
      <path d="M58 84Q58 76 68 76H132Q142 76 142 84V86q-3 8-6 0q-4 12-8 0H108q-3 16-7 0H80q-3 10-6 0H58Z" fill="#B8712A"/>
      <rect x="90" y="66" width="20" height="11" rx="2" fill="#FBE39A"/>
      <circle cx="36" cy="134" r="6" fill="#C9505A"/><circle cx="46" cy="140" r="5" fill="#C9505A"/>
      <circle cx="160" cy="136" r="4.5" fill="#4F6993"/><circle cx="168" cy="130" r="4" fill="#4F6993"/><circle cx="170" cy="140" r="4" fill="#4F6993"/>
      ${leaf(36, 124, -30, '#9FBF96')}
      ${sparkle(40, 50, 5, '#E0B45C')}${sparkle(160, 46, 6, '#E0B45C')}${sparkle(130, 30, 3.5, '#C9505A')}
    `),
  },
  {
    id: 'citrus-morning',
    name: 'Citrus Morning',
    category: 'Brunch',
    tagline: 'Lemon and orange slices.',
    frame: 'blob',
    titleFont: 'serif',
    colors: { bg: '#FEF8E2', ink: '#4C4322', accent: '#8A5210', soft: '#F8EBB6' },
    defaults: {
      eyebrow: 'Mimosas at noon',
      title: 'Citrus garden brunch',
      hosts: 'with Clara and Joe',
      date: '2027-05-16',
      time: '11:30',
      venue: 'The Lemon Grove',
      address: '6 Orchard Road, Santa Barbara',
      message: 'Fresh juice, frittata and a long table under the trees.',
      rsvp: 'RSVP to Clara by May 9',
    },
    art: svg(`
      ${leaf(104, 52, -20, '#7FA676')}${leaf(118, 60, 40, '#93AE87')}${leaf(44, 106, 30, '#93AE87')}${leaf(160, 130, -30, '#7FA676')}
      ${citrus(70, 66, 24, '#E9C23A', '#F6DC6A')}
      ${citrus(130, 96, 28, '#E58A3A', '#F3AE5E')}
      ${citrus(66, 122, 16, '#9FBF5A', '#C5DC86')}
      ${sparkle(160, 40, 5, '#E58A3A')}${sparkle(36, 40, 4, '#E9C23A')}${sparkle(104, 140, 3.5, '#E9C23A')}
    `),
  },
  {
    id: 'coffee-croissant',
    name: 'Coffee and Croissant',
    category: 'Brunch',
    tagline: 'A latte heart and a warm pastry.',
    frame: 'arch',
    titleFont: 'display',
    colors: { bg: '#F5EDE4', ink: '#4A3426', accent: '#7A4E33', soft: '#E7D7C6' },
    defaults: {
      eyebrow: 'Coffee first, then catch up',
      title: 'Saturday coffee club',
      hosts: 'brewed by Elif',
      date: '2027-02-13',
      time: '09:30',
      venue: 'Bean & Leaf',
      address: '40 Market Street, Philadelphia',
      message: 'Pastries, coffee and a whole morning to talk.',
      rsvp: 'Text Elif by February 10',
    },
    art: svg(`
      <path d="M78 64q6-8 0-16q-6-8 0-16M92 62q6-8 0-16q-6-8 0-16" stroke="#C9A88A" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <ellipse cx="90" cy="134" rx="44" ry="6" fill="#F6EEE5" stroke="#C9A88A" stroke-width="1.5"/>
      <path d="M118 90q18 0 16 14q-2 12-18 10" stroke="#C9A88A" stroke-width="5" fill="none" stroke-linecap="round"/>
      <path d="M60 80H120V104Q120 130 90 130Q60 130 60 104Z" fill="#FFFFFF" stroke="#C9A88A" stroke-width="2"/>
      <ellipse cx="90" cy="80" rx="30" ry="6" fill="#8A5A3C"/>
      <path d="M90 79c-1.6-2.4-5-1.4-5 1 0 2 5 4 5 4s5-2 5-4c0-2.4-3.4-3.4-5-1z" fill="#E3C8AA"/>
      <path d="M70 104H110" stroke="#E8A9A0" stroke-width="3"/>
      <g stroke="#B9783A" stroke-width="1">
        <ellipse cx="128" cy="130" rx="9" ry="7" transform="rotate(-40 128 130)" fill="#E2A65F"/>
        <ellipse cx="138" cy="122" rx="10" ry="8" transform="rotate(-15 138 122)" fill="#E9B36B"/>
        <ellipse cx="152" cy="120" rx="11" ry="9" fill="#E2A65F"/>
        <ellipse cx="166" cy="122" rx="10" ry="8" transform="rotate(15 166 122)" fill="#E9B36B"/>
        <ellipse cx="176" cy="130" rx="9" ry="7" transform="rotate(40 176 130)" fill="#E2A65F"/>
      </g>
      ${sparkle(150, 50, 5, '#E0B45C')}${sparkle(36, 90, 4, '#C9A88A')}
    `),
  },
  {
    id: 'diploma-blue',
    name: 'Diploma Blue',
    category: 'Graduation',
    tagline: 'A scroll, a seal and laurels.',
    frame: 'rect',
    titleFont: 'serif',
    colors: { bg: '#EEF2F8', ink: '#273452', accent: '#34508A', soft: '#DCE4F1' },
    defaults: {
      eyebrow: 'Join us to celebrate',
      title: 'Dr. Maya Chen',
      hosts: 'on earning her PhD',
      date: '2027-05-22',
      time: '17:00',
      venue: 'Faculty Club Terrace',
      address: '1 University Drive, Ann Arbor',
      message: 'Six years of research, one evening of cake and toasts.',
      rsvp: 'RSVP to Wei by May 14',
    },
    art: svg(`
      <path d="M30 140Q40 110 58 96M170 140Q160 110 142 96" stroke="#7F9A72" stroke-width="2" fill="none"/>
      ${leaf(36, 126, -50, '#93AE87')}${leaf(46, 112, -40, '#A9C29D')}${leaf(56, 100, -30, '#93AE87')}
      ${leaf(164, 126, 50, '#93AE87')}${leaf(154, 112, 40, '#A9C29D')}${leaf(144, 100, 30, '#93AE87')}
      <rect x="50" y="40" width="100" height="56" rx="4" fill="#FFFDF6" stroke="#C9B98F" stroke-width="1.5"/>
      <ellipse cx="50" cy="68" rx="7" ry="28" fill="#F1EADA" stroke="#C9B98F" stroke-width="1.5"/>
      <ellipse cx="150" cy="68" rx="7" ry="28" fill="#F1EADA" stroke="#C9B98F" stroke-width="1.5"/>
      <path d="M70 56H130M74 66H126M80 76H116" stroke="#AEB9D0" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M114 100l-6 22 8-5 6 7 2-24zM126 100l6 22-8-5-6 7-2-24z" fill="#D98E88"/>
      <circle cx="120" cy="96" r="12" fill="#34508A"/>${sparkle(120, 96, 6, '#E0B45C')}
      ${sparkle(30, 34, 5, '#E0B45C')}${sparkle(172, 30, 4, '#34508A')}
    `),
  },
  {
    id: 'bright-future',
    name: 'Bright Future',
    category: 'Graduation',
    tagline: 'Sunrise over green hills.',
    frame: 'arch',
    titleFont: 'display',
    colors: { bg: '#FFF2E8', ink: '#57331F', accent: '#9C4522', soft: '#FBD9C2' },
    defaults: {
      eyebrow: 'The future is bright',
      title: 'Congrats, Jamie!',
      hosts: 'high school class of 2027',
      date: '2027-06-12',
      time: '13:00',
      venue: 'Riverside Park',
      address: 'Picnic Shelter 3, Columbus, OH',
      message: 'Burgers, lawn games and the biggest cake we could find.',
      rsvp: 'RSVP to Lisa by June 5',
    },
    art: svg(`
      <g stroke="#F2B15C" stroke-width="4" stroke-linecap="round">
        <path d="M100 52V40M70 60l-6-10M130 60l6-10M50 80l-10-6M150 80l10-6M44 104H32M156 104h12"/>
      </g>
      <circle cx="100" cy="104" r="36" fill="#F2B15C"/>
      <path d="M0 120Q50 96 100 118T200 112V160H0Z" fill="#9FBF96"/>
      <path d="M0 138Q70 114 130 136T200 130V160H0Z" fill="#7FA676"/>
      <g transform="rotate(-18 58 42)">
        <path d="M58 30L82 40L58 50L34 40Z" fill="#273452"/>
        <path d="M46 45V54Q58 60 70 54V45L58 50Z" fill="#1C2640"/>
        <path d="M58 40Q70 44 74 46V58" stroke="#E0B45C" stroke-width="1.6" fill="none"/>
      </g>
      ${sparkle(160, 30, 5, '#F2B15C')}${sparkle(24, 76, 4, '#9C4522')}${sparkle(176, 60, 3, '#9C4522')}
    `),
  },
  {
    id: 'bookworm',
    name: 'Bookworm',
    category: 'Graduation',
    tagline: 'A stack of books and an apple.',
    frame: 'blob',
    titleFont: 'display',
    colors: { bg: '#F2F5ED', ink: '#33412C', accent: '#4A6A30', soft: '#DFE7D3' },
    defaults: {
      eyebrow: 'Hit the books, then the party',
      title: 'Ruby graduates!',
      hosts: 'with the Alvarez family',
      date: '2027-05-29',
      time: '16:00',
      venue: 'The Alvarez backyard',
      address: '23 Willow Drive, Phoenix',
      message: 'Tacos, music and a toast to the next chapter.',
      rsvp: 'RSVP to Marta by May 22',
    },
    art: svg(`
      <rect x="50" y="118" width="100" height="20" rx="3" fill="#5A7A3E"/><path d="M58 128H142" stroke="#FFFFFF" stroke-width="1.5" opacity=".6"/>
      <rect x="60" y="99" width="84" height="19" rx="3" fill="#D98E88"/><path d="M68 108H136" stroke="#FFFFFF" stroke-width="1.5" opacity=".6"/>
      <rect x="54" y="80" width="90" height="19" rx="3" fill="#E0B45C"/><path d="M62 89H136" stroke="#FFFFFF" stroke-width="1.5" opacity=".6"/>
      <circle cx="84" cy="66" r="13" fill="#C9505A"/>
      <path d="M84 53q1-6 4-8" stroke="#5A3E22" stroke-width="2" fill="none" stroke-linecap="round"/>${leaf(91, 50, -20, '#7FA676')}
      <circle cx="116" cy="72" r="7" fill="none" stroke="#33412C" stroke-width="2"/><circle cx="134" cy="72" r="7" fill="none" stroke="#33412C" stroke-width="2"/>
      <path d="M123 71q2-2 4 0" stroke="#33412C" stroke-width="2" fill="none"/>
      ${sparkle(40, 50, 5, '#E0B45C')}${sparkle(166, 46, 4, '#4A6A30')}${sparkle(170, 120, 3.5, '#E0B45C')}
    `),
  },
  {
    id: 'plant-parent',
    name: 'Plant Parent',
    category: 'Housewarming',
    tagline: 'Three pots on a sunny shelf.',
    frame: 'arch',
    titleFont: 'display',
    colors: { bg: '#EEF4EB', ink: '#2F4331', accent: '#41693F', soft: '#DAE7D5' },
    defaults: {
      eyebrow: 'New place, new plants',
      title: 'Housewarming at Kai’s',
      hosts: 'bring a cutting if you like',
      date: '2027-04-24',
      time: '18:00',
      venue: 'Kai’s new flat',
      address: '12 Fern Street, Unit 4, Oakland',
      message: 'Snacks, a plant swap and the first party on the balcony.',
      rsvp: 'Text Kai by April 18',
    },
    art: svg(`
      <path d="M20 140H180" stroke="#B98A6A" stroke-width="4" stroke-linecap="round"/>
      <path d="M100 112Q96 80 80 60M100 112Q104 78 122 56M100 112V50" stroke="#5E8F5A" stroke-width="2" fill="none"/>
      <ellipse cx="80" cy="60" rx="14" ry="9" transform="rotate(-35 80 60)" fill="#5E8F5A"/>
      <ellipse cx="122" cy="56" rx="14" ry="9" transform="rotate(35 122 56)" fill="#6FA06A"/>
      <ellipse cx="100" cy="46" rx="10" ry="14" fill="#6FA06A"/>
      <path d="M84 112h32l-4 26h-24z" fill="#C27A55"/>
      <rect x="40" y="92" width="12" height="28" rx="6" fill="#8DB07E"/>
      <path d="M40 104q-8 0-8-8v-4M52 100q8 0 8-8v-6" stroke="#8DB07E" stroke-width="6" fill="none" stroke-linecap="round"/>
      <path d="M34 120h24l-3 18h-18z" fill="#E3B49A"/>
      <path d="M142 122h28l-3 16h-22z" fill="#C99577"/>
      <path d="M150 122q-6 10-2 22M160 122q8 12 2 20" stroke="#7FA676" stroke-width="1.6" fill="none"/>
      ${leaf(146, 132, -60, '#7FA676')}${leaf(150, 144, 60, '#93AE87')}${leaf(164, 134, 60, '#7FA676')}${leaf(162, 146, -40, '#93AE87')}
      ${sparkle(160, 50, 5, '#E0B45C')}${sparkle(40, 50, 4, '#E0B45C')}
    `),
  },
  {
    id: 'new-keys',
    name: 'New Keys',
    category: 'Housewarming',
    tagline: 'A key ring with a heart tag.',
    frame: 'circle',
    titleFont: 'serif',
    colors: { bg: '#FCF2E6', ink: '#563C23', accent: '#875A22', soft: '#F2DFC4' },
    defaults: {
      eyebrow: 'We got the keys',
      title: 'Welcome to our first home',
      hosts: 'Rafa and Lu',
      date: '2027-01-30',
      time: '17:00',
      venue: 'Our first home',
      address: '64 Ashford Road, Baltimore',
      message: 'Pizza, boxes for chairs and a tour of every corner.',
      rsvp: 'Let us know by January 24',
    },
    art: svg(`
      <circle cx="100" cy="52" r="14" fill="none" stroke="#B98A4A" stroke-width="4"/>
      ${key(-26, '#E0B45C', '#F2DFC4')}${key(24, '#C9A35A', '#F2DFC4')}
      <path d="M100 66V92" stroke="#B98A4A" stroke-width="2"/>
      <path d="M100 98c-4-6-13-3.5-13 3 0 6 13 13 13 13s13-7 13-13c0-6.5-9-9-13-3z" fill="#D98E88"/>
      ${sparkle(150, 40, 5, '#E0B45C')}${sparkle(44, 44, 4, '#D98E88')}${sparkle(160, 120, 3.5, '#B98A4A')}${sparkle(36, 120, 3.5, '#E0B45C')}
    `),
  },
  {
    id: 'cozy-window',
    name: 'Cozy Window',
    category: 'Housewarming',
    tagline: 'A glowing window and a sleepy cat.',
    frame: 'rect',
    titleFont: 'display',
    dark: true,
    colors: { bg: '#2E3442', ink: '#F4EADB', accent: '#E8B866', soft: '#3A4254' },
    defaults: {
      eyebrow: 'Lights on, door open',
      title: 'Come see our cozy nest',
      hosts: 'Mira, Tom and Biscuit the cat',
      date: '2026-12-05',
      time: '19:00',
      venue: 'Our place',
      address: '9 Lantern Lane, Burlington, VT',
      message: 'Mulled cider, board games and a very friendly cat.',
      rsvp: 'RSVP to Mira by November 28',
    },
    art: svg(`
      ${sparkle(30, 30, 3, '#F4EADB')}${sparkle(172, 40, 4, '#E8B866')}${sparkle(24, 90, 2.5, '#F4EADB')}${sparkle(178, 96, 3, '#F4EADB')}
      <rect x="58" y="26" width="84" height="98" rx="6" fill="#F5D899"/>
      <path d="M100 26V124M58 72H142" stroke="#8A6A4A" stroke-width="4"/>
      <rect x="58" y="26" width="84" height="98" rx="6" fill="none" stroke="#8A6A4A" stroke-width="4"/>
      <path d="M52 22H80Q70 60 74 124H52Z" fill="#C98A7A"/>
      <path d="M148 22H120Q130 60 126 124H148Z" fill="#C98A7A"/>
      <rect x="46" y="122" width="108" height="9" rx="2" fill="#8A6A4A"/>
      <rect x="66" y="106" width="8" height="16" rx="1.5" fill="#FFF7EA"/><ellipse cx="70" cy="101" rx="2.6" ry="4.5" fill="#F2A65A"/>
      <ellipse cx="118" cy="114" rx="15" ry="9" fill="#232835"/>
      <circle cx="130" cy="104" r="7.5" fill="#232835"/>
      <path d="M125 99l1-7 4 5zM135 99l-1-7-4 5z" fill="#232835"/>
      <path d="M104 118q-12 4-6 -8" stroke="#232835" stroke-width="4" fill="none" stroke-linecap="round"/>
    `),
  },
  {
    id: 'botez-porumbel',
    name: 'Porumbel alb',
    category: 'Botez',
    locales: ['ro'],
    tagline: 'Porumbel alb, ramură de măslin și cer senin.',
    frame: 'arch',
    titleFont: 'serif',
    colors: { bg: '#F1F5F8', ink: '#2F4054', accent: '#4A658A', soft: '#DEE8F2' },
    defaults: {
      eyebrow: 'Cu bucurie vă invităm la',
      title: 'Botezul lui Matei',
      hosts: 'părinții Andreea & Vlad, nașii Ioana & Radu',
      date: '2027-05-15',
      time: '11:00',
      venue: 'Biserica Sf. Elefterie',
      address: 'Strada Sf. Elefterie 1, București',
      message: 'După slujbă vă așteptăm la petrecere la Salonul Grădina Dorobanți, de la ora 13:30.',
      rsvp: 'Confirmări până pe 1 mai',
    },
    art: svg(`
      <g fill="#FFFFFF" opacity=".9">
        <circle cx="48" cy="126" r="14"/><circle cx="68" cy="120" r="18"/><circle cx="90" cy="126" r="14"/>
        <circle cx="122" cy="132" r="13"/><circle cx="142" cy="126" r="17"/><circle cx="160" cy="132" r="13"/>
      </g>
      <path d="M58 84Q76 52 104 68Q126 42 152 62Q132 82 114 88Q94 102 68 96Z" fill="#FFFFFF" stroke="#B7CADC" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M98 72Q114 38 144 46Q126 66 112 78Z" fill="#F8FBFD" stroke="#B7CADC" stroke-width="1.5" stroke-linejoin="round"/>
      <circle cx="72" cy="80" r="11" fill="#FFFFFF" stroke="#B7CADC" stroke-width="1.5"/>
      <path d="M62 80l-9 3 9 3Z" fill="#E0B45C"/>
      <circle cx="69" cy="78" r="1.8" fill="#2F4054"/>
      <path d="M56 84Q40 94 28 84" stroke="#7C9A74" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      ${leaf(44, 88, -30, '#8FA886')}${leaf(35, 84, 40, '#A9C29D')}${leaf(27, 83, -20, '#8FA886')}
      ${sparkle(160, 34, 6, '#E0B45C')}${sparkle(36, 40, 4.5, '#E0B45C')}${sparkle(104, 28, 3.5, '#FFFFFF')}${sparkle(170, 96, 4, '#E0B45C')}
    `),
  },
  {
    id: 'botez-ingeras',
    name: 'Nori și stele',
    category: 'Botez',
    locales: ['ro'],
    tagline: 'Stele aurii și nori pufoși de botez.',
    frame: 'circle',
    titleFont: 'display',
    colors: { bg: '#FBF6EC', ink: '#54422C', accent: '#8A5E1A', soft: '#F3E7CE' },
    defaults: {
      eyebrow: 'Vă invităm să ne fiți alături la',
      title: 'Botezul Sofiei',
      hosts: 'cu drag, din partea familiei Ionescu',
      date: '2027-06-12',
      time: '12:00',
      venue: 'Biserica Sf. Nicolae',
      address: 'Strada Bisericii Ortodoxe 12, Cluj-Napoca',
      message: 'Petrecerea continuă de la ora 14:30 la Restaurantul Căsuța din Parc.',
      rsvp: 'Confirmă până pe 1 iunie',
    },
    art: svg(`
      <path d="M66 14V44M100 14V34M136 14V52" stroke="#D4B57A" stroke-width="1.3"/>
      ${sparkle(66, 50, 8, '#E6BE68')}${sparkle(100, 40, 6, '#E6BE68')}${sparkle(136, 58, 7, '#E6BE68')}
      <circle cx="100" cy="84" r="14" fill="none" stroke="#E0B45C" stroke-width="2.2"/>
      <path d="M100 74V94M93 82H107" stroke="#D49E3F" stroke-width="2.6" stroke-linecap="round"/>
      <g fill="#FFFFFF">
        <circle cx="56" cy="118" r="18"/><circle cx="82" cy="110" r="22"/><circle cx="114" cy="112" r="21"/><circle cx="142" cy="118" r="17"/>
        <rect x="44" y="116" width="110" height="20" rx="10"/>
      </g>
      ${sparkle(32, 74, 4, '#E0B45C')}${sparkle(168, 86, 4.5, '#E0B45C')}${sparkle(42, 144, 3, '#D4B57A')}${sparkle(158, 144, 3, '#D4B57A')}
    `),
  },
  {
    id: 'botez-lumanare',
    name: 'Lumânare cu flori',
    category: 'Botez',
    locales: ['ro'],
    tagline: 'Lumânare de botez cu panglică și trandafiri.',
    frame: 'rect',
    titleFont: 'serif',
    colors: { bg: '#FAF0EE', ink: '#57383B', accent: '#934B54', soft: '#F2DCDF' },
    defaults: {
      eyebrow: 'Sărbătorim creștinarea micuței noastre',
      title: 'Botezul Mariei',
      hosts: 'părinții Elena & Andrei',
      date: '2027-04-18',
      time: '11:30',
      venue: 'Biserica Sf. Gheorghe',
      address: 'Strada Republicii 22, Brașov',
      message: 'Vă așteptăm apoi la masa festivă la Salonul Belvedere, de la ora 14:00.',
      rsvp: 'Confirmări până pe 4 aprilie',
    },
    art: svg(`
      <ellipse cx="100" cy="40" rx="14" ry="18" fill="#FBE5A8" opacity=".55"/>
      <ellipse cx="100" cy="40" rx="6" ry="11" fill="#F2A65A"/>
      <ellipse cx="100" cy="43" rx="3" ry="6" fill="#FFF7D6"/>
      <rect x="86" y="56" width="28" height="86" rx="6" fill="#FFFDF9" stroke="#E2C3C5" stroke-width="1.6"/>
      <path d="M86 92H114V104H86Z" fill="#E8A9A0"/>
      <path d="M96 104l-12 24M104 104l12 24" stroke="#E8A9A0" stroke-width="4" stroke-linecap="round"/>
      ${leaf(72, 90, -40, '#93AE87')}${leaf(128, 92, 40, '#93AE87')}${leaf(76, 108, 30, '#A9C29D')}${leaf(124, 108, -30, '#A9C29D')}
      ${rose(84, 96, 11, '#F2C3C2', '#C98589')}${rose(116, 96, 11, '#F2C3C2', '#C98589')}${rose(100, 94, 13, '#E8A3A6', '#B86A70')}
      ${sparkle(40, 44, 5, '#E0B45C')}${sparkle(162, 52, 4.5, '#E0B45C')}${sparkle(48, 128, 3.5, '#C98589')}${sparkle(154, 126, 3.5, '#C98589')}
    `),
  },
  {
    id: 'botez-leagan',
    name: 'Primul zâmbet',
    category: 'Botez',
    locales: ['ro'],
    tagline: 'Leagăn de lemn, flori și steluțe.',
    frame: 'blob',
    titleFont: 'display',
    colors: { bg: '#EFF4EE', ink: '#334535', accent: '#496B48', soft: '#DCE8DA' },
    defaults: {
      eyebrow: 'Vă chemăm cu drag la',
      title: 'Botezul lui Luca',
      hosts: 'împreună cu nașii Mara & Mihai',
      date: '2027-07-10',
      time: '10:30',
      venue: 'Catedrala Mitropolitană',
      address: 'Bulevardul Regele Ferdinand I, Timișoara',
      message: 'Continuăm bucuria cu masa de botez la Grădina de Vară, de la ora 13:00.',
      rsvp: 'Confirmă până pe 25 iunie',
    },
    art: svg(`
      <path d="M100 18V36M78 36H122M78 36V50M100 36V54M122 36V50" stroke="#9FBF96" stroke-width="1.6"/>
      ${sparkle(78, 54, 5, '#E0B45C')}${sparkle(100, 58, 6, '#E8A9A0')}${sparkle(122, 54, 5, '#E0B45C')}
      <path d="M56 88H144V112Q144 126 128 126H72Q56 126 56 112Z" fill="#FFFDF7" stroke="#C59B76" stroke-width="2.4"/>
      <path d="M76 88V126M100 88V126M124 88V126" stroke="#C59B76" stroke-width="1.8"/>
      <path d="M58 106Q100 116 142 106V114Q142 125 128 125H72Q58 125 58 114Z" fill="#DCE8DA"/>
      <path d="M46 128Q100 148 154 128" fill="none" stroke="#B68A62" stroke-width="3.6" stroke-linecap="round"/>
      ${daisy(34, 134, '#FFFFFF', '#E0B45C')}${daisy(166, 132, '#FFFFFF', '#E0B45C')}
      ${leaf(44, 140, -30, '#8FA886')}${leaf(156, 138, 30, '#8FA886')}
    `),
  },
  {
    id: 'cununie-verighete',
    name: 'Verighete de aur',
    category: 'Cununie',
    locales: ['ro'],
    tagline: 'Verighete, sigiliu de ceară și eucalipt.',
    frame: 'arch',
    titleFont: 'serif',
    colors: { bg: '#F7F3E8', ink: '#434937', accent: '#526E4B', soft: '#E8E3D0' },
    defaults: {
      eyebrow: 'Vă invităm la cununia noastră civilă',
      title: 'Diana & Alexandru',
      hosts: 'spun „Da!” în fața celor dragi',
      date: '2027-05-22',
      time: '13:00',
      venue: 'Casa Căsătoriilor Sector 1',
      address: 'Bulevardul Mareșal Averescu 17, București',
      message: 'După ceremonie toastăm împreună la Terasa Kiseleff, de la ora 15:00.',
      rsvp: 'Confirmări până pe 8 mai',
    },
    art: svg(`
      <rect x="46" y="72" width="108" height="68" rx="6" fill="#FFFDF8" stroke="#D2C3A3" stroke-width="1.8"/>
      <path d="M48 74l52 38 52-38" fill="none" stroke="#D2C3A3" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="100" cy="112" r="12" fill="#D98E88"/>
      <path d="M100 109c-1.8-2.4-5.4-1.4-5.4 1.2 0 2.4 5.4 5.4 5.4 5.4s5.4-3 5.4-5.4c0-2.6-3.6-3.6-5.4-1.2z" fill="#FFF5F3"/>
      <circle cx="88" cy="54" r="19" fill="none" stroke="#D4AE62" stroke-width="5"/>
      <circle cx="112" cy="54" r="19" fill="none" stroke="#C49A48" stroke-width="5"/>
      ${leaf(44, 62, -45, '#8FA886')}${leaf(38, 78, -25, '#A9C29D')}${leaf(156, 62, 45, '#8FA886')}${leaf(162, 78, 25, '#A9C29D')}
      ${sparkle(100, 22, 5, '#D4AE62')}${sparkle(60, 36, 3.5, '#D4AE62')}${sparkle(140, 36, 3.5, '#D4AE62')}
    `),
  },
  {
    id: 'cununie-sampanie',
    name: 'Toast de cununie',
    category: 'Cununie',
    locales: ['ro'],
    tagline: 'Cupe de șampanie și bule aurii.',
    frame: 'circle',
    titleFont: 'serif',
    colors: { bg: '#FAF4EB', ink: '#543E29', accent: '#8B5B20', soft: '#F1E3CE' },
    defaults: {
      eyebrow: 'Spunem „Da!”',
      title: 'Irina & Ștefan',
      hosts: 'vă așteaptă la cununia civilă',
      date: '2027-06-26',
      time: '14:00',
      venue: 'Primăria Municipiului Sibiu',
      address: 'Piața Mare 2, Sibiu',
      message: 'Sărbătorim cu șampanie și masă festivă la Restaurantul Grădina Veche.',
      rsvp: 'Confirmă până pe 12 iunie',
    },
    art: svg(`
      <g transform="rotate(-14 82 96)">
        <path d="M68 48H92L88 86Q80 96 72 86Z" fill="#FFFDF8" stroke="#C9A26B" stroke-width="1.8"/>
        <path d="M70 64H90L87 84Q80 92 73 84Z" fill="#F5D88E"/>
        <path d="M80 92V128M68 128H92" stroke="#C9A26B" stroke-width="2.2" stroke-linecap="round"/>
      </g>
      <g transform="rotate(14 118 96)">
        <path d="M108 48H132L128 86Q120 96 112 86Z" fill="#FFFDF8" stroke="#C9A26B" stroke-width="1.8"/>
        <path d="M110 64H130L127 84Q120 92 113 84Z" fill="#F5D88E"/>
        <path d="M120 92V128M108 128H132" stroke="#C9A26B" stroke-width="2.2" stroke-linecap="round"/>
      </g>
      <circle cx="98" cy="34" r="3" fill="#E6BE68"/><circle cx="106" cy="24" r="2.2" fill="#E6BE68"/><circle cx="92" cy="22" r="2" fill="#E8A9A0"/>
      ${sparkle(100, 44, 6, '#E0B45C')}${sparkle(42, 60, 4.5, '#E0B45C')}${sparkle(160, 60, 4.5, '#E0B45C')}
      ${daisy(44, 134, '#FFFFFF', '#E0B45C')}${daisy(156, 134, '#FFFFFF', '#E0B45C')}
    `),
  },
  {
    id: 'cununie-bujori',
    name: 'Bujori de mai',
    category: 'Cununie',
    locales: ['ro'],
    tagline: 'Bujori roz legați cu panglică.',
    frame: 'blob',
    titleFont: 'serif',
    colors: { bg: '#FCF0F1', ink: '#5A393D', accent: '#944C57', soft: '#F5DCE0' },
    defaults: {
      eyebrow: 'Vă invităm cu drag la cununie',
      title: 'Bianca & Tudor',
      hosts: 'alături de familie și prieteni apropiați',
      date: '2027-05-09',
      time: '12:30',
      venue: 'Starea Civilă Cluj-Napoca',
      address: 'Strada Moților 5, Cluj-Napoca',
      message: 'Vă așteptăm apoi la prânz și șampanie la Bistro Grădina Botanică.',
      rsvp: 'Confirmă până pe 25 aprilie',
    },
    art: svg(`
      <path d="M100 100V146M96 108L82 142M104 108L118 142" stroke="#7F9A72" stroke-width="2.2" stroke-linecap="round"/>
      ${leaf(62, 102, -40, '#8FA886')}${leaf(138, 102, 40, '#8FA886')}${leaf(68, 72, -60, '#A9C29D')}${leaf(132, 72, 60, '#A9C29D')}
      ${rose(76, 86, 17, '#F5C4CC', '#C97A88')}${rose(124, 86, 17, '#F5C4CC', '#C97A88')}${rose(100, 68, 21, '#EC9FAA', '#B86272')}
      <ellipse cx="90" cy="122" rx="10" ry="5" transform="rotate(-18 90 122)" fill="none" stroke="#D98E88" stroke-width="3.2"/>
      <ellipse cx="110" cy="122" rx="10" ry="5" transform="rotate(18 110 122)" fill="none" stroke="#D98E88" stroke-width="3.2"/>
      ${sparkle(42, 42, 4.5, '#E0B45C')}${sparkle(158, 42, 4.5, '#E0B45C')}${sparkle(100, 26, 4, '#D98E88')}
    `),
  },
  {
    id: 'cununie-seara',
    name: 'Seară de gală',
    category: 'Cununie',
    locales: ['ro'],
    tagline: 'Arcadă aurie pe fond verde smarald.',
    frame: 'rect',
    titleFont: 'serif',
    dark: true,
    colors: { bg: '#243430', ink: '#F4EFE2', accent: '#E2BE74', soft: '#30443F' },
    defaults: {
      eyebrow: 'Cununie civilă și cină festivă',
      title: 'Mara & Cristian',
      hosts: 'vă invită să sărbătorim împreună',
      date: '2027-09-18',
      time: '16:00',
      venue: 'Palatul Culturii',
      address: 'Piața Ștefan cel Mare și Sfânt 1, Iași',
      message: 'Cununia în grădina palatului, urmată de cină și muzică live de la ora 18:30.',
      rsvp: 'Confirmări până pe 1 septembrie',
    },
    art: svg(`
      <path d="M54 142V76Q54 32 100 32Q146 32 146 76V142" fill="none" stroke="#E2BE74" stroke-width="2.4"/>
      <path d="M64 142V78Q64 42 100 42Q136 42 136 78V142" fill="none" stroke="#E2BE74" stroke-width="1" opacity=".6"/>
      ${leaf(56, 120, -45, '#7FA68C')}${leaf(54, 96, -30, '#96B8A1')}${leaf(144, 120, 45, '#7FA68C')}${leaf(146, 96, 30, '#96B8A1')}
      <circle cx="90" cy="96" r="14" fill="none" stroke="#E2BE74" stroke-width="3.6"/>
      <circle cx="110" cy="96" r="14" fill="none" stroke="#D1A95A" stroke-width="3.6"/>
      ${sparkle(100, 62, 6, '#E2BE74')}${sparkle(32, 42, 4, '#F4EFE2')}${sparkle(168, 46, 4.5, '#E2BE74')}${sparkle(166, 124, 3, '#F4EFE2')}
    `),
  },
];

// Later templates in a category inherit unset sample text from the category's first template, in each language.
const categoryDefaults = {};
const roCategoryDefaults = {};
TEMPLATES.forEach((t) => {
  if (!categoryDefaults[t.category]) categoryDefaults[t.category] = t.defaults;
  else t.defaults = { ...categoryDefaults[t.category], ...t.defaults };

  const ro = RO_TEMPLATE_COPY[t.id];
  if (ro) {
    const merged = roCategoryDefaults[t.category] ? { ...roCategoryDefaults[t.category], ...ro.defaults } : ro.defaults;
    if (!roCategoryDefaults[t.category]) roCategoryDefaults[t.category] = merged;
    t.ro = { ...ro, defaults: merged };
  }
});

const EN_CATEGORIES = [
  ...new Set(TEMPLATES.filter((t) => !t.locales || t.locales.includes('en')).map((t) => t.category)),
];
const RO_CATEGORIES = [
  'Wedding',
  'Cununie',
  'Botez',
  'Birthday',
  'Housewarming',
  'Graduation',
  'Baby shower',
  'Brunch',
];

// Occasions in the order their first template appears on English pages.
export const CATEGORIES = EN_CATEGORIES;

// Accent swatches. Templates marked dark render each swatch's light variant so text stays readable.
export const ACCENTS = [
  { hex: '#A44E47', name: 'Rose', light: '#EBA59E' },
  { hex: '#52704C', name: 'Sage', light: '#A9C99F' },
  { hex: '#4F6993', name: 'Dusk blue', light: '#A9BFE6' },
  { hex: '#8A5F18', name: 'Honey', light: '#E2BC72' },
  { hex: '#7A5A9A', name: 'Lilac', light: '#CDB4EA' },
  { hex: '#2F3D35', name: 'Evergreen', light: '#A8D1B8' },
];

// The landing hero and the social preview card fan out these three contrasting occasions.
// css/styles.css positions exactly three .fan children with :nth-child; check-invite.js asserts the count.
export const HERO_TEMPLATES = ['birthday', 'wedding', 'baby'];
export const RO_HERO_TEMPLATES = ['wedding', 'botez-porumbel', 'birthday'];

// The landing banner beside the call to action shows this template.
export const BANNER_TEMPLATE = 'housewarming';

// The editor opens this template when a link or draft names none or an unknown one.
export const DEFAULT_TEMPLATE = 'birthday';

// The landing gallery badges these templates as popular.
export const POPULAR_TEMPLATES = ['birthday', 'wedding'];
export const RO_POPULAR_TEMPLATES = ['wedding', 'botez-porumbel', 'cununie-verighete', 'birthday'];

/** @param {string} [lang] */
export const categoriesFor = (lang = 'en') => (normalizeLang(lang) === 'ro' ? RO_CATEGORIES : EN_CATEGORIES);

/** @param {string} [lang] */
export const heroTemplatesFor = (lang = 'en') => (normalizeLang(lang) === 'ro' ? RO_HERO_TEMPLATES : HERO_TEMPLATES);

/** @param {string} [lang] */
export const popularTemplatesFor = (lang = 'en') =>
  normalizeLang(lang) === 'ro' ? RO_POPULAR_TEMPLATES : POPULAR_TEMPLATES;

/**
 * Returns a template with its localized display name, tagline and sample defaults for lang.
 * @param {(typeof TEMPLATES)[number]} template
 * @param {string} [lang]
 */
export function localizeTemplate(template, lang = 'en') {
  if (normalizeLang(lang) !== 'ro' || !template.ro) return template;
  return { ...template, name: template.ro.name, tagline: template.ro.tagline, defaults: template.ro.defaults };
}

/**
 * Templates available on the given locale's landing page and editor picker.
 * Romanian leads with one representative template per local occasion before listing the rest.
 * @param {string} [lang]
 */
export function templatesFor(lang = 'en') {
  const code = normalizeLang(lang);
  if (code === 'en') return TEMPLATES.filter((t) => !t.locales || t.locales.includes('en'));
  const byCategory = new Map(RO_CATEGORIES.map((c) => [c, []]));
  for (const t of TEMPLATES) {
    if (!t.locales || t.locales.includes('ro')) byCategory.get(t.category)?.push(localizeTemplate(t, 'ro'));
  }
  const ordered = [];
  const maxLen = Math.max(...[...byCategory.values()].map((list) => list.length));
  for (let i = 0; i < maxLen; i += 1) {
    for (const c of RO_CATEGORIES) {
      const item = byCategory.get(c)[i];
      if (item) ordered.push(item);
    }
  }
  return ordered;
}

export function getTemplate(id, lang = 'en') {
  const found = TEMPLATES.find((t) => t.id === id) || TEMPLATES.find((t) => t.id === DEFAULT_TEMPLATE);
  return localizeTemplate(found, lang);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

export function formatDate(iso, locale) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(hhmm, locale) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const isRo = typeof locale === 'string' && locale.toLowerCase().startsWith('ro');
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(
    locale,
    isRo ? { hour: '2-digit', minute: '2-digit', hour12: false } : { hour: 'numeric', minute: '2-digit' },
  );
}

// The card colors as rendered: a known accent swatch replaces the template accent.
export function inviteColors(template, accentHex) {
  const c = template.colors;
  const swatch = ACCENTS.find((a) => a.hex === accentHex);
  return { bg: c.bg, ink: c.ink, accent: swatch ? swatch[template.dark ? 'light' : 'hex'] : c.accent, soft: c.soft };
}

// Photos are JPEG data URLs from the editor, or PNG where the browser cannot encode JPEG.
// Any other string could break out of the CSS url(), so renderInvite draws the template art instead.
export const PHOTO_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

// d: a record from makeInviteData (js/invite.js), plus an optional photo.
// The card sizes in container units, so it renders inside its .invite-wrap container:
// a link when href is set, a <span> when inline is set for use inside a <label>, otherwise a <div>.
// label becomes the container's aria-label. decorative hides a sample thumbnail from screen readers.
// locale formats the date and time; it defaults to the browser's, and scripts/pages.js fixes it so its output is stable.
// Pages insert the result with mountInvites (js/mount.js), which also fits the text.
/**
 * @param {(typeof TEMPLATES)[number]} template
 * @param {Record<string, any>} d
 * @param {{ href?: string, label?: string, inline?: boolean, decorative?: boolean, locale?: string }} [options]
 */
export function renderInvite(template, d, { href, label, inline, decorative, locale } = {}) {
  const c = inviteColors(template, d.accent);
  const isRo = typeof locale === 'string' && locale.toLowerCase().startsWith('ro');
  const style = `--i-bg:${c.bg};--i-ink:${c.ink};--i-accent:${c.accent};--i-soft:${c.soft}`;
  const art = PHOTO_URL.test(d.photo)
    ? `<div class="invite-photo" role="img" aria-label="${UI[isRo ? 'ro' : 'en'].photoAlt}" style="background-image:url('${d.photo}');background-position:50% ${Number(d.photoY)}%"></div>`
    : template.art;
  const dateText = formatDate(d.date, locale);
  const timeText = formatTime(d.time, locale);
  const when = isRo
    ? [dateText, timeText ? `ora ${timeText}` : ''].filter(Boolean).join(', ')
    : [dateText, timeText].filter(Boolean).join(' at ');
  const tag = href ? 'a' : inline ? 'span' : 'div';
  const attrs =
    (href ? ` href="${escapeHtml(href)}"` : '') +
    (label ? ` aria-label="${escapeHtml(label)}"` : '') +
    (decorative ? ' aria-hidden="true"' : '');

  return `<${tag} class="invite-wrap"${attrs}>
    <article class="invite font-${template.titleFont}" style="${style}">
      <div class="invite-frame frame-${template.frame}">${art}</div>
      <div class="invite-body">
        ${d.eyebrow ? `<p class="invite-eyebrow">${escapeHtml(d.eyebrow)}</p>` : ''}
        <h3 class="invite-title">${escapeHtml(d.title)}</h3>
        ${d.hosts ? `<p class="invite-hosts">${escapeHtml(d.hosts)}</p>` : ''}
        <div class="invite-rule" aria-hidden="true"><span></span></div>
        ${when ? `<p class="invite-when">${escapeHtml(when)}</p>` : ''}
        ${d.venue ? `<p class="invite-venue">${escapeHtml(d.venue)}</p>` : ''}
        ${d.address ? `<p class="invite-address">${escapeHtml(d.address)}</p>` : ''}
        ${d.message ? `<p class="invite-message">${escapeHtml(d.message)}</p>` : ''}
        ${d.rsvp ? `<p class="invite-rsvp">${escapeHtml(d.rsvp)}</p>` : ''}
      </div>
    </article></${tag}>`;
}
