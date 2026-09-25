import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { env, isProduction } from './config/env.js';
import health from './routes/health.js';
import config from './routes/config.js';
import auth from './routes/auth.js';
import me from './routes/me.js';
import admin from './routes/admin.js';
import roles from './routes/roles.js';
import vendor from './routes/vendor/index.js';
import delivery from './routes/delivery.js';
import support from './routes/support/index.js';
import integrations, { webhookRouter as integrationWebhooks } from './routes/integrations/index.js';
import customer from './routes/customer.js';
import commerce from './routes/commerce.js';
import operations from './routes/operations/index.js';
import controlPlane from './routes/control-plane.js';
import growth from './routes/growth.js';
import account from './routes/account.js';
import { securityHeaders, requestId, rateLimit, corsOrigin } from './middleware/security.js';
import { pool } from './db/pool.js';
import { dispatchPendingNotifications } from './services/notifications/service.js';
import { runFulfillmentAutomation, runSlaAutomation } from './services/fulfillment/automation.js';
import { runGrowthAutomation } from './services/commerce/loyalty.js';
import { dispatchIntegrationOutbox } from './services/integrations/event-bus.js';
import { reconcileFinance, reconcileCashfreePayments } from './services/finance/reconciliation.js';
import { cashfreeConfigured } from './services/payment/cashfree.js';
import { runOperationalAlertAutomation } from './services/operations/alerts.js';
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.TRUST_PROXY ? 1 : false);
app.use(requestId);
app.use(securityHeaders);
app.use(cors({ origin: (origin, callback) => callback(null, corsOrigin(origin)), credentials: true, methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'], allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id', 'X-Webhook-Signature', 'X-Webhook-Timestamp', 'X-Webhook-Event-Id'] }));
app.use(rateLimit('global', env.RATE_LIMIT_MAX));
app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.get('/', (_req, res) => res.json({ service: 'AasPass API', version: '0.3.0' }));
app.use('/api/v1/health', health);
app.use('/api/v1/config', config);
app.use('/api/v1/auth', auth);
app.use('/api/v1/me', me);
app.use('/api/v1/customer', customer);
app.use('/api/v1/commerce', commerce);
app.use('/api/v1/admin', admin);
app.use('/api/v1/admin/operations', operations);
app.use('/api/v1/admin/control-plane', controlPlane);
app.use('/api/v1/growth', growth);
app.use('/api/v1/account', account);
app.use('/api/v1/roles', roles);
app.use('/api/v1/vendor', vendor);
app.use('/api/v1/delivery', delivery);
app.use('/api/v1/support', support);
app.use('/api/v1/integrations', rateLimit('webhooks', env.WEBHOOK_RATE_LIMIT_MAX), integrationWebhooks);
app.use('/api/v1/integrations', integrations);
app.use((err, req, res, _next) => {
    if (err instanceof ZodError) {
        res.status(400).json({ error: 'VALIDATION_ERROR', details: err.issues, requestId: req.requestId });
        return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: 'INTERNAL_ERROR', message: isProduction ? 'Internal server error' : message, requestId: req.requestId });
});
const server = app.listen(env.PORT, () => console.log(`AasPass API listening on :${env.PORT}`));
const notificationWorker = env.DATABASE_URL && env.NOTIFICATION_DISPATCH_ENABLED
    ? setInterval(() => { void dispatchPendingNotifications().catch((error) => console.error('notification worker error', error)); }, 5000)
    : null;
const reconciliationWorker = env.DATABASE_URL
    ? setInterval(() => { void reconcileFinance(null).catch((error) => console.error('finance reconciliation worker error', error)); if (cashfreeConfigured())
        void reconcileCashfreePayments(null).catch((error) => console.error('provider reconciliation worker error', error)); }, 300000)
    : null;
const operationsWorker = env.DATABASE_URL
    ? setInterval(() => { void runFulfillmentAutomation().catch((error) => console.error('fulfillment worker error', error)); void runSlaAutomation().catch((error) => console.error('sla worker error', error)); void runGrowthAutomation().catch((error) => console.error('growth worker error', error)); void dispatchIntegrationOutbox().catch((error) => console.error('integration outbox worker error', error)); void runOperationalAlertAutomation().catch((error) => console.error('operational alert worker error', error)); }, 30000)
    : null;
async function shutdown(signal) {
    console.log(`Received ${signal}; shutting down`);
    server.close(async () => {
        try {
            if (notificationWorker)
                clearInterval(notificationWorker);
            if (operationsWorker)
                clearInterval(operationsWorker);
            if (reconciliationWorker)
                clearInterval(reconciliationWorker);
            await pool?.end();
        }
        finally {
            process.exit(0);
        }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
