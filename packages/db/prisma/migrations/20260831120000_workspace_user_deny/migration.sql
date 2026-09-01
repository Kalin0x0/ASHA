-- An explicit per-user block on a workspace.
--
-- Access that arrives through a group had no per-person off switch: you cannot
-- take someone out of the everyone-group, and detaching the group from the
-- workspace changes it for the whole company. A row with denied = true says
-- "not this person" and overrides any grant they would otherwise inherit.
--
-- Existing rows are grants, so the default is false and no data changes.
ALTER TABLE "WorkspaceUser" ADD COLUMN     "denied" BOOLEAN NOT NULL DEFAULT false;
