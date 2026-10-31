import { Router } from 'express';
import {
  getOnboardingStatus,
  startOnboarding,
  getUserGuilds as getOnboardingUserGuilds,
  selectAndVerifyServer,
  runInitialSync,
  configureCommunity,
  completeOnboarding,
  switchServer,
  getOnboardingChecklist,
  recordFirstValueAction,
} from '../controllers/onboarding.controller.js';

export const onboardingRouter = Router();

onboardingRouter.get('/status', getOnboardingStatus);
onboardingRouter.get('/checklist', getOnboardingChecklist);
onboardingRouter.post('/first-value', recordFirstValueAction);
onboardingRouter.post('/start', startOnboarding);
onboardingRouter.get('/user-guilds', getOnboardingUserGuilds);
onboardingRouter.post('/verify-server', selectAndVerifyServer);
onboardingRouter.post('/sync', runInitialSync);
onboardingRouter.post('/configure', configureCommunity);
onboardingRouter.post('/complete', completeOnboarding);
onboardingRouter.post('/switch-server', switchServer);

export default onboardingRouter;
