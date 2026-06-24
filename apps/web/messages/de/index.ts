/**
 * Assembles this locale's message catalog. This file is IDENTICAL in every
 * locale folder — when adding a language, copy the whole folder and only
 * translate the JSON files.
 */
import access from './access.json';
import auth from './auth.json';
import common from './common.json';
import connectivity from './connectivity.json';
import dashboard from './dashboard.json';
import developer from './developer.json';
import feedback from './feedback.json';
import infrastructure from './infrastructure.json';
import observability from './observability.json';
import portal from './portal.json';
import pwa from './pwa.json';
import sessions from './sessions.json';
import settings from './settings.json';
import shell from './shell.json';
import storage from './storage.json';
import support from './support.json';
import viewer from './viewer.json';
import workspaces from './workspaces.json';

const messages = {
  access,
  auth,
  common,
  connectivity,
  dashboard,
  developer,
  feedback,
  infrastructure,
  observability,
  portal,
  pwa,
  sessions,
  settings,
  shell,
  storage,
  support,
  viewer,
  workspaces,
};

export default messages;
