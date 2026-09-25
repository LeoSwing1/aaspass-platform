import { Router } from 'express';
const router = Router();
router.get('/', (_req, res) => res.json({ brand: 'AasPass', tagline: 'Jo chahiye, aas-paas se.', currency: 'INR', platformFeePaise: 100, platformGstRateBps: 1800, vendorMinimumSubscriptionPaise: 19900, vendorPlans: { STARTER: 19900, BUSINESS: 49900, PRO: 99900 } }));
export default router;
