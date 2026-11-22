// The Vercel Function for every /api, /e and /ro/e path; vercel.json rewrites all three here.
import { createApi } from '../server/api.js';
import { createEventPage } from '../server/event-page.js';
import { connect } from '../server/postgres.js';

const db = connect(process.env.DATABASE_URL);
const api = createApi(db);
const eventPage = createEventPage(db);
const isEventPage = (pathname) => pathname.startsWith('/e/') || pathname.startsWith('/ro/e/');
const handle = (request) => (isEventPage(new URL(request.url).pathname) ? eventPage(request) : api(request));

export { handle as GET, handle as HEAD, handle as PUT, handle as DELETE };
