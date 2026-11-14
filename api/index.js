// The Vercel Function for every /api path; vercel.json rewrites /api/(.*) here and server/api.js routes it.
import { createApi } from '../server/api.js';
import { connect } from '../server/postgres.js';

const handle = createApi(connect(process.env.DATABASE_URL));
export { handle as GET, handle as PUT, handle as DELETE };
