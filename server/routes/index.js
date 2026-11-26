// The route list of server/api.js. Each route module exports routes: {pattern, methods} entries, where pattern
// matches the whole path and captures the ids, and methods maps an HTTP method to its action. A new module adds
// one entry here.
import { routes as events } from './events.js';
import { routes as replies } from './replies.js';
import { routes as retention } from './retention.js';
import { routes as stats } from './stats.js';

export const ROUTES = [events, replies, retention, stats].flat();
