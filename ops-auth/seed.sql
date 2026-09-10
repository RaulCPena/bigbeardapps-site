-- Seed Big Beard Ops dashboard with real apps + useful links.
-- Safe to re-run: clears seedable tables first.

DELETE FROM checklist_items;
DELETE FROM apps;
DELETE FROM links;
DELETE FROM notes;

-- Apps (from data/apps.json)
INSERT INTO apps (id, slug, name, status, app_store_url, site_url, next_action, sort_order, updated_at) VALUES
  ('app-feastmark', 'feastmark', 'Feastmark', 'live',
   'https://apps.apple.com/app/feastmark-save-any-recipe/id6762322193',
   'https://bigbeardapps.com/feastmark/',
   'Watch reviews + first paid-import threshold', 1, 1778860800000),
  ('app-payoffpilot', 'payoffpilot', 'PayoffPilot', 'live',
   'https://apps.apple.com/app/payoffpilot/id6753783449',
   'https://bigbeardapps.com/payoffpilot/',
   'Check App Store ranking keywords', 2, 1778860800000),
  ('app-reeltalk', 'reeltalk', 'ReelTalk', 'live',
   'https://apps.apple.com/us/app/reel-talk-fishing-stickers/id6794788951',
   'https://bigbeardapps.com/reeltalk/',
   'Ship seasonal sticker pack if demand shows', 3, 1778860800000),
  ('app-gunmark', 'gunmark', 'Gunmark', 'beta',
   NULL,
   'https://bigbeardapps.com/gunmark/',
   'Grow TestFlight → submit for review', 4, 1778860800000),
  ('app-huntmark', 'huntmark', 'HuntMark', 'development',
   NULL,
   'https://bigbeardapps.com/huntmark/',
   'Define MVP scope for public-land catalog', 5, 1778860800000);

-- Default checklists per app
INSERT INTO checklist_items (id, app_id, title, done, sort_order) VALUES
  ('cl-fm-1', 'app-feastmark', 'App Store listing current', 1, 1),
  ('cl-fm-2', 'app-feastmark', 'Support page FAQ current', 1, 2),
  ('cl-fm-3', 'app-feastmark', 'Press kit zip present', 1, 3),
  ('cl-fm-4', 'app-feastmark', 'Respond to new reviews weekly', 0, 4),

  ('cl-pp-1', 'app-payoffpilot', 'App Store listing current', 1, 1),
  ('cl-pp-2', 'app-payoffpilot', 'Support page FAQ current', 1, 2),
  ('cl-pp-3', 'app-payoffpilot', 'Press kit zip present', 1, 3),
  ('cl-pp-4', 'app-payoffpilot', 'Respond to new reviews weekly', 0, 4),

  ('cl-rt-1', 'app-reeltalk', 'App Store listing current', 1, 1),
  ('cl-rt-2', 'app-reeltalk', 'Support page FAQ current', 1, 2),
  ('cl-rt-3', 'app-reeltalk', 'Press kit zip present', 1, 3),
  ('cl-rt-4', 'app-reeltalk', 'Respond to new reviews weekly', 0, 4),

  ('cl-gm-1', 'app-gunmark', 'TestFlight public link working', 1, 1),
  ('cl-gm-2', 'app-gunmark', 'Privacy page accurate for beta', 1, 2),
  ('cl-gm-3', 'app-gunmark', 'App Store screenshots ready', 0, 3),
  ('cl-gm-4', 'app-gunmark', 'Submit for App Review', 0, 4),

  ('cl-hm-1', 'app-huntmark', 'Landing page live', 1, 1),
  ('cl-hm-2', 'app-huntmark', 'MVP feature list written', 0, 2),
  ('cl-hm-3', 'app-huntmark', 'TestFlight build', 0, 3),
  ('cl-hm-4', 'app-huntmark', 'Privacy + support copy ready', 0, 4);

-- Starter notes
INSERT INTO notes (id, title, body, created_at, updated_at) VALUES
  ('note-1', 'Why this ops board exists',
   'Dogfood a lean solo-dev ops tool on Cloudflare free tier. Keep only: app command center, notes, link board. No fluff, branding later.',
   1778860800000, 1778860800000),
  ('note-2', 'Gunmark next',
   'Beta is open via TestFlight. Next hard gate is App Review materials + screenshots, then flip status to review on the marketing site.',
   1778860800000, 1778860800000);

-- Link board
INSERT INTO links (id, title, url, category, sort_order) VALUES
  ('lnk-1', 'Marketing site', 'https://bigbeardapps.com/', 'Site', 1),
  ('lnk-2', 'GitHub — site', 'https://github.com/RaulCPena/bigbeardapps-site', 'Site', 2),
  ('lnk-3', 'App Store Connect', 'https://appstoreconnect.apple.com/', 'Apple', 3),
  ('lnk-4', 'Gunmark TestFlight', 'https://testflight.apple.com/join/AMJF9pAk', 'Apple', 4),
  ('lnk-5', 'Cloudflare Workers', 'https://dash.cloudflare.com/043c813f753abea6e92ba52b229685cc/workers-and-pages', 'Cloudflare', 5),
  ('lnk-6', 'Zero Trust Access', 'https://one.dash.cloudflare.com/', 'Cloudflare', 6),
  ('lnk-7', 'D1 databases', 'https://dash.cloudflare.com/043c813f753abea6e92ba52b229685cc/workers/d1', 'Cloudflare', 7),
  ('lnk-8', 'Support inbox', 'mailto:support@bigbeardapps.com', 'Support', 8);
