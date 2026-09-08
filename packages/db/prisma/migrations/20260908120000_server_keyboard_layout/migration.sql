-- The keyboard layout of a remote host, per host.

-- The browser sends the CHARACTER a key produced, so the user's own keyboard is
-- already accounted for by the time anything reaches guacd. What guacd still has
-- to know is which scancodes reproduce that character on the machine at the
-- other end — and that was one value for the whole installation
-- (GUAC_RDP_SERVER_LAYOUT), so every host with a different layout mistyped.
--
-- NULL means "the installation default still applies", which is what every
-- existing row gets and how they all behaved before, so no data changes.
ALTER TABLE "Server" ADD COLUMN     "keyboardLayout" TEXT;
