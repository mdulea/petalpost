// The Vercel Function for every /api and /e path; vercel.json rewrites both here.
import { createApi } from '../server/api.js';
import { createEventPage } from '../server/event-page.js';
import { connect } from '../server/postgres.js';

const db = connect(process.env.DATABASE_URL);
const api = createApi(db);
const eventPage = createEventPage(db);
const handle = (request) => (new URL(request.url).pathname.startsWith('/e/') ? eventPage(request) : api(request));

export { handle as GET, handle as HEAD, handle as PUT, handle as DELETE };
