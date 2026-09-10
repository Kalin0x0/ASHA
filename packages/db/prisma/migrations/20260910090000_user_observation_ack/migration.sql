-- One-time consent to live observation, per user.
--
-- Under the org's `ack` notice mode the per-session banner is dropped for a
-- user who has accepted the disclosure; these two columns are that acceptance.
-- Version lets a materially reworded disclosure ask again. NULL means the user
-- has never accepted — the banner then still shows, so no existing row loses a
-- notice it had, and the default behaviour (live mode, banner always) is
-- unchanged for every current install.
ALTER TABLE "User" ADD COLUMN "observationAckAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "observationAckVersion" INTEGER;
