import { Hono } from 'hono'
import type { AppEnv } from './types/env'
import auth from './routes/auth'
import org from './routes/org'
import announcements from './routes/announcements'
import surveys from './routes/surveys'
import handover from './routes/handover'
import chat from './routes/chat'
import volunteer from './routes/volunteer'
import ledger from './routes/ledger'
import ui from './routes/ui'

const app = new Hono<AppEnv>()

app.route('/', ui)

app.get('/api', (c) =>
  c.json({
    service: 'copta-app',
    status: 'ok',
    poc_ui: '/app',
    docs: 'https://github.com/JINX0404/copta-app',
  }),
)

app.route('/auth', auth)
app.route('/org', org)
app.route('/org/:orgId/announcements', announcements)
app.route('/org/:orgId/surveys', surveys)
app.route('/org/:orgId/handover', handover)
app.route('/org/:orgId/chat', chat)
app.route('/org/:orgId/volunteer', volunteer)
app.route('/org/:orgId/ledger', ledger)

export default app
