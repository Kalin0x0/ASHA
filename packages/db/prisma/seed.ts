/* eslint-disable no-console */
import { Prisma, PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Raw client on purpose: seeding must not be tenant-scoped.
const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@asha.local';
const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = process.env.ASHA_SEED_ADMIN_PASSWORD ?? 'AshaAdmin!2026';

// ── Permission catalog (canonical copy mirrored in @asha/rbac) ─────────────
const PERMISSIONS: Array<{ key: string; category: string; description: string }> = [
  // Sessions
  { key: 'SESSION_VIEW', category: 'Sessions', description: 'View own sessions' },
  { key: 'SESSION_VIEW_ANY', category: 'Sessions', description: 'View all sessions' },
  { key: 'SESSION_LAUNCH', category: 'Sessions', description: 'Launch workspaces' },
  { key: 'SESSION_TERMINATE_OWN', category: 'Sessions', description: 'Terminate own sessions' },
  { key: 'SESSION_TERMINATE_ANY', category: 'Sessions', description: 'Terminate any session' },
  { key: 'SESSION_CONTROL_ANY', category: 'Sessions', description: 'Take control of any session' },
  { key: 'SESSION_SHARE', category: 'Sessions', description: 'Share sessions' },
  { key: 'RECORDING_VIEW', category: 'Sessions', description: 'View session recordings' },
  // Workspaces
  { key: 'WORKSPACE_VIEW', category: 'Workspaces', description: 'View workspaces' },
  { key: 'WORKSPACE_CREATE', category: 'Workspaces', description: 'Create workspaces' },
  { key: 'WORKSPACE_EDIT', category: 'Workspaces', description: 'Edit workspaces' },
  { key: 'WORKSPACE_DELETE', category: 'Workspaces', description: 'Delete workspaces' },
  { key: 'REGISTRY_MANAGE', category: 'Workspaces', description: 'Manage registries' },
  { key: 'IMAGE_MANAGE', category: 'Workspaces', description: 'Manage images' },
  // Access
  { key: 'USER_VIEW', category: 'Access', description: 'View users' },
  { key: 'USER_CREATE', category: 'Access', description: 'Create users' },
  { key: 'USER_EDIT', category: 'Access', description: 'Edit users' },
  { key: 'USER_DELETE', category: 'Access', description: 'Delete users' },
  { key: 'GROUP_MANAGE', category: 'Access', description: 'Manage groups' },
  { key: 'ROLE_MANAGE', category: 'Access', description: 'Manage roles & permissions' },
  { key: 'AUTH_MANAGE', category: 'Access', description: 'Manage authentication providers' },
  // Infrastructure
  { key: 'ZONE_MANAGE', category: 'Infrastructure', description: 'Manage deployment zones' },
  { key: 'AGENT_VIEW', category: 'Infrastructure', description: 'View agents' },
  { key: 'AGENT_MANAGE', category: 'Infrastructure', description: 'Manage agents' },
  { key: 'SERVER_MANAGE', category: 'Infrastructure', description: 'Manage servers' },
  { key: 'POOL_MANAGE', category: 'Infrastructure', description: 'Manage server pools' },
  { key: 'AUTOSCALE_MANAGE', category: 'Infrastructure', description: 'Manage autoscale configs' },
  { key: 'PROVIDER_MANAGE', category: 'Infrastructure', description: 'Manage VM/DNS providers' },
  // Storage / connectivity
  { key: 'STORAGE_MANAGE', category: 'Storage', description: 'Manage storage & file mappings' },
  { key: 'CONNECTIVITY_MANAGE', category: 'Connectivity', description: 'Manage proxies/egress/filtering' },
  // Settings
  { key: 'SETTINGS_MANAGE', category: 'Settings', description: 'Manage global settings' },
  { key: 'BRANDING_MANAGE', category: 'Settings', description: 'Manage branding' },
  { key: 'LICENSE_MANAGE', category: 'Settings', description: 'Manage licensing' },
  // Observability / developer
  { key: 'AUDIT_VIEW', category: 'Observability', description: 'View audit logs' },
  { key: 'REPORTING_VIEW', category: 'Observability', description: 'View reports & metrics' },
  // Support
  { key: 'BUG_VIEW', category: 'Support', description: 'View bug reports & fix knowledge' },
  { key: 'BUG_MANAGE', category: 'Support', description: 'Triage, resolve & document bug reports' },
  { key: 'WEBHOOK_MANAGE', category: 'Developer', description: 'Manage webhooks' },
  { key: 'APIKEY_MANAGE', category: 'Developer', description: 'Manage API keys' },
];

const ALL_KEYS = PERMISSIONS.map((p) => p.key);

const ROLE_DEFS: Array<{ name: string; description: string; keys: string[] }> = [
  { name: 'Super Admin', description: 'Full unrestricted access', keys: ALL_KEYS },
  {
    name: 'Administrator',
    description: 'Manage the deployment',
    keys: ALL_KEYS.filter((k) => k !== 'LICENSE_MANAGE'),
  },
  {
    name: 'Operator',
    description: 'Monitor and operate sessions & infrastructure',
    keys: [
      'SESSION_VIEW',
      'SESSION_VIEW_ANY',
      'SESSION_LAUNCH',
      'SESSION_TERMINATE_ANY',
      'SESSION_CONTROL_ANY',
      'RECORDING_VIEW',
      'WORKSPACE_VIEW',
      'AGENT_VIEW',
      'REPORTING_VIEW',
      'AUDIT_VIEW',
      'BUG_VIEW',
    ],
  },
  {
    name: 'User',
    description: 'Launch and use workspaces',
    keys: ['SESSION_VIEW', 'SESSION_LAUNCH', 'SESSION_TERMINATE_OWN', 'SESSION_SHARE', 'WORKSPACE_VIEW'],
  },
];

async function upsertSystemRole(name: string, description: string) {
  const existing = await prisma.role.findFirst({ where: { orgId: null, name } });
  if (existing) {
    return prisma.role.update({ where: { id: existing.id }, data: { description, isSystem: true } });
  }
  return prisma.role.create({ data: { name, description, isSystem: true, orgId: null } });
}

async function main() {
  console.log('▸ Seeding permissions…');
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { category: p.category, description: p.description },
      create: p,
    });
  }
  const perms = await prisma.permission.findMany();
  const permId = new Map(perms.map((p) => [p.key, p.id]));

  console.log('▸ Seeding roles…');
  const roleByName = new Map<string, string>();
  for (const r of ROLE_DEFS) {
    const role = await upsertSystemRole(r.name, r.description);
    roleByName.set(r.name, role.id);
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: r.keys.map((k) => ({ roleId: role.id, permissionId: permId.get(k)! })),
      skipDuplicates: true,
    });
  }

  console.log('▸ Seeding organisation…');
  const org = await prisma.org.upsert({
    where: { slug: 'asha' },
    update: {},
    create: { name: 'Asha', slug: 'asha' },
  });

  console.log('▸ Seeding default zone…');
  await prisma.deploymentZone.upsert({
    where: { id: 'seed-zone-default' },
    update: {},
    create: {
      id: 'seed-zone-default',
      orgId: org.id,
      name: 'default',
      region: 'on-prem',
      isDefault: true,
      proxyBaseUrl: process.env.ASHA_PUBLIC_URL ?? 'https://asha.local',
    },
  });

  console.log('▸ Seeding groups…');
  const adminGroup = await prisma.group.upsert({
    where: { orgId_name: { orgId: org.id, name: 'Administrators' } },
    update: {},
    create: { id: 'seed-group-admins', orgId: org.id, name: 'Administrators', priority: 1 },
  });
  const allUsers = await prisma.group.upsert({
    where: { orgId_name: { orgId: org.id, name: 'All Users' } },
    update: {},
    create: {
      id: 'seed-group-all',
      orgId: org.id,
      name: 'All Users',
      priority: 1000,
      isDefault: true,
      idleDisconnectSec: 3600,
      keepaliveExpirationSec: 28800,
    },
  });

  // group → role
  async function linkGroupRole(groupId: string, roleName: string) {
    const roleId = roleByName.get(roleName)!;
    await prisma.groupRole.upsert({
      where: { groupId_roleId: { groupId, roleId } },
      update: {},
      create: { groupId, roleId },
    });
  }
  await linkGroupRole(adminGroup.id, 'Super Admin');
  await linkGroupRole(allUsers.id, 'User');

  console.log('▸ Seeding admin user…');
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { orgId_email: { orgId: org.id, email: ADMIN_EMAIL } },
    update: { isSystemAdmin: true, status: 'ACTIVE' },
    create: {
      orgId: org.id,
      email: ADMIN_EMAIL,
      username: ADMIN_USERNAME,
      displayName: 'Asha Administrator',
      isSystemAdmin: true,
      status: 'ACTIVE',
    },
  });
  await prisma.userCredential.deleteMany({ where: { userId: admin.id, kind: 'PASSWORD' } });
  await prisma.userCredential.create({
    data: { userId: admin.id, kind: 'PASSWORD', secret: passwordHash },
  });
  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: admin.id, groupId: adminGroup.id } },
    update: {},
    create: { orgId: org.id, userId: admin.id, groupId: adminGroup.id },
  });
  await prisma.userGroup.upsert({
    where: { userId_groupId: { userId: admin.id, groupId: allUsers.id } },
    update: {},
    create: { orgId: org.id, userId: admin.id, groupId: allUsers.id },
  });

  console.log('▸ Seeding images & workspaces…');
  const images = [
    {
      id: 'seed-img-firefox',
      name: 'firefox',
      friendlyName: 'Firefox',
      dockerImage: 'kasmweb/firefox:1.16.0',
      iconUrl: 'https://kasm-static-content.s3.amazonaws.com/icons/firefox.svg',
    },
    {
      id: 'seed-img-chrome',
      name: 'chrome',
      friendlyName: 'Google Chrome',
      dockerImage: 'kasmweb/chrome:1.16.0',
      iconUrl: 'https://kasm-static-content.s3.amazonaws.com/icons/chrome.svg',
    },
    {
      id: 'seed-img-desktop',
      name: 'ubuntu-desktop',
      friendlyName: 'Ubuntu Desktop',
      dockerImage: 'kasmweb/desktop:1.16.0',
      iconUrl: 'https://kasm-static-content.s3.amazonaws.com/icons/ubuntu.svg',
    },
    {
      id: 'seed-img-terminal',
      name: 'terminal',
      friendlyName: 'Terminal',
      dockerImage: 'kasmweb/terminal:1.16.0',
      iconUrl: 'https://kasm-static-content.s3.amazonaws.com/icons/terminal.svg',
    },
  ];

  for (const img of images) {
    await prisma.image.upsert({
      where: { id: img.id },
      update: { dockerImage: img.dockerImage, available: true },
      create: {
        id: img.id,
        orgId: org.id,
        name: img.name,
        friendlyName: img.friendlyName,
        dockerImage: img.dockerImage,
        channel: 'CORE',
        protocol: 'KASMVNC',
        available: true,
        runConfigDefaults: { ports: [6901], env: { VNC_PW: 'generated-at-runtime' } },
      },
    });

    const ws = await prisma.workspace.upsert({
      where: { orgId_name: { orgId: org.id, name: img.name } },
      update: { imageId: img.id, enabled: true },
      create: {
        orgId: org.id,
        name: img.name,
        friendlyName: img.friendlyName,
        description: `${img.friendlyName} streamed in an isolated container.`,
        type: 'CONTAINER',
        imageId: img.id,
        iconUrl: img.iconUrl,
        categories: img.name === 'ubuntu-desktop' ? ['Desktops'] : ['Browsers'],
        enabled: true,
        coresLimit: 2,
        memLimitMb: 2768,
        dockerConfig: { shmSize: '1g', ports: [6901] },
      },
    });
    // grant the default group access
    await prisma.workspace.update({
      where: { id: ws.id },
      data: { groups: { connect: { id: allUsers.id } } },
    });
  }

  console.log('▸ Seeding license, branding, settings…');
  await prisma.license.upsert({
    where: { id: 'seed-license' },
    update: {},
    create: {
      id: 'seed-license',
      orgId: org.id,
      type: 'CONCURRENT',
      seats: 25,
      concurrentSessions: 25,
      issuedTo: 'Asha Development',
      features: { branding: true, recording: true, autoscale: true, sso: true },
    },
  });

  await prisma.branding.upsert({
    where: { scope_orgId_groupId: { scope: 'ORG', orgId: org.id, groupId: '' } },
    update: {},
    create: {
      scope: 'ORG',
      orgId: org.id,
      groupId: '',
      productName: 'Asha',
      primaryColor: '#1a1a2e',
      accentColor: '#d4af37',
    },
  });

  await prisma.loginConfig.upsert({
    where: { orgId: org.id },
    update: {},
    create: {
      orgId: org.id,
      noticeTitle: 'Authorized access only',
      noticeBody: 'This is a private Asha deployment. Activity may be monitored.',
    },
  });

  for (const [key, value] of Object.entries({
    'session.default_idle_disconnect_sec': 3600,
    'session.default_keepalive_sec': 28800,
    'branding.product_name': 'Asha',
    'security.enforce_2fa': false,
  })) {
    await prisma.setting.upsert({
      where: { scope_orgId_zoneId_key: { scope: 'ORG', orgId: org.id, zoneId: '', key } },
      update: { valueJson: value as Prisma.InputJsonValue },
      create: { scope: 'ORG', orgId: org.id, zoneId: '', key, valueJson: value as Prisma.InputJsonValue },
    });
  }

  // ── Image registries + marketplace catalog ─────────────────────────────────
  // Seed default registry sources + a starter catalog so the Image Registry is
  // populated out of the box (no external sync required to browse images).
  const REGISTRIES: Array<{ id: string; name: string; url: string; type: Prisma.RegistryCreateInput['type'] }> = [
    { id: 'seed-reg-kasm', name: 'Kasm Technologies', url: 'https://registry.kasmweb.com/1.0/', type: 'FIRST_PARTY' },
    { id: 'seed-reg-lsio', name: 'LinuxServer.io', url: 'https://api.linuxserver.io/api/v1/images', type: 'THIRD_PARTY' },
    { id: 'seed-reg-asha', name: 'Asha Official', url: 'https://registry.asha.io/index.json', type: 'FIRST_PARTY' },
  ];
  for (const r of REGISTRIES) {
    await prisma.registry.upsert({
      where: { id: r.id },
      update: { name: r.name, url: r.url, type: r.type, orgId: org.id, enabled: true, lastSyncedAt: new Date() },
      create: { id: r.id, orgId: org.id, name: r.name, url: r.url, type: r.type, enabled: true, lastSyncedAt: new Date() },
    });
  }

  type Entry = [reg: string, name: string, friendly: string, image: string, cats: string[], gib: number, desc: string];
  const CATALOG: Entry[] = [
    ['seed-reg-kasm', 'firefox', 'Firefox', 'kasmweb/firefox:1.16.0', ['Browsers'], 2.8, 'Isolated Firefox browser session.'],
    ['seed-reg-kasm', 'chrome', 'Google Chrome', 'kasmweb/chrome:1.16.0', ['Browsers'], 2.7, 'Isolated Chrome browser session.'],
    ['seed-reg-kasm', 'brave', 'Brave', 'kasmweb/brave:1.16.0', ['Browsers'], 2.8, 'Privacy-focused Brave browser.'],
    ['seed-reg-kasm', 'edge', 'Microsoft Edge', 'kasmweb/edge:1.16.0', ['Browsers'], 2.9, 'Microsoft Edge browser.'],
    ['seed-reg-kasm', 'tor-browser', 'Tor Browser', 'kasmweb/tor-browser:1.16.0', ['Browsers', 'Security'], 2.0, 'Non-attributable research browsing.'],
    ['seed-reg-kasm', 'ubuntu-jammy', 'Ubuntu Desktop', 'kasmweb/ubuntu-jammy-desktop:1.16.0', ['Desktops'], 4.0, 'Full Ubuntu XFCE desktop.'],
    ['seed-reg-kasm', 'debian-bookworm', 'Debian Bookworm', 'kasmweb/debian-bookworm-desktop:1.16.0', ['Desktops'], 7.8, 'Debian 12 desktop environment.'],
    ['seed-reg-kasm', 'fedora-41', 'Fedora 41', 'kasmweb/fedora-41-desktop:1.16.0', ['Desktops'], 8.5, 'Fedora 41 desktop.'],
    ['seed-reg-kasm', 'alpine-321', 'Alpine 3.21', 'kasmweb/alpine-321-desktop:1.16.0', ['Desktops'], 4.9, 'Lightweight Alpine 3.21 desktop.'],
    ['seed-reg-kasm', 'vs-code', 'VS Code', 'kasmweb/vs-code:1.16.0', ['Development'], 4.1, 'Cloud development environment.'],
    ['seed-reg-kasm', 'postman', 'Postman', 'kasmweb/postman:1.16.0', ['Development'], 3.1, 'API development workspace.'],
    ['seed-reg-kasm', 'blender', 'Blender', 'kasmweb/blender:1.16.0', ['Creative'], 3.7, 'GPU-accelerated 3D suite.'],
    ['seed-reg-kasm', 'gimp', 'GIMP', 'kasmweb/gimp:1.16.0', ['Creative'], 2.5, 'Image editing workspace.'],
    ['seed-reg-kasm', 'inkscape', 'Inkscape', 'kasmweb/inkscape:1.16.0', ['Creative'], 2.7, 'Vector graphics editor.'],
    ['seed-reg-kasm', 'libre-office', 'LibreOffice', 'kasmweb/libre-office:1.16.0', ['Productivity'], 3.4, 'Office productivity suite.'],
    ['seed-reg-kasm', 'obsidian', 'Obsidian', 'kasmweb/obsidian:1.16.0', ['Productivity'], 3.2, 'Markdown knowledge base.'],
    ['seed-reg-kasm', 'discord', 'Discord', 'kasmweb/discord:1.16.0', ['Communication'], 2.6, 'Voice, video & text chat.'],
    ['seed-reg-kasm', 'kali-rolling', 'Kali Linux', 'kasmweb/kali-rolling-desktop:1.16.0', ['Security', 'Desktops'], 8.2, 'Security testing desktop.'],
    ['seed-reg-kasm', 'maltego', 'Maltego', 'kasmweb/maltego:1.16.0', ['Security'], 3.2, 'OSINT link analysis.'],
    ['seed-reg-lsio', 'plex', 'Plex', 'lscr.io/linuxserver/plex:latest', ['Media'], 1.2, 'Plex media server.'],
    ['seed-reg-lsio', 'jellyfin', 'Jellyfin', 'lscr.io/linuxserver/jellyfin:latest', ['Media'], 1.4, 'Free software media system.'],
    ['seed-reg-lsio', 'qbittorrent', 'qBittorrent', 'lscr.io/linuxserver/qbittorrent:latest', ['Productivity'], 0.4, 'BitTorrent client.'],
    ['seed-reg-lsio', 'nextcloud', 'Nextcloud', 'lscr.io/linuxserver/nextcloud:latest', ['Productivity'], 0.7, 'Self-hosted file sync & share.'],
    ['seed-reg-asha', 'asha-desktop', 'Asha Desktop', 'asha/desktop:1.0.0', ['Desktops'], 3.0, 'Branded Asha XFCE desktop.'],
  ];
  for (const [reg, name, friendly, image, cats, gib, desc] of CATALOG) {
    const id = `seed-mk-${name}`;
    const data = {
      registryId: reg,
      name,
      friendlyName: friendly,
      description: desc,
      dockerImage: image,
      categories: cats,
      raw: { size_mb: Math.round(gib * 1024) } as Prisma.InputJsonValue,
    };
    await prisma.registryEntry.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  console.log('▸ Seeding bug reports + fix memory…');
  // A resolved bug WITH its documented fix — demonstrates the "fix memory":
  // a future report carrying the same fingerprint surfaces this resolution.
  const sampleFingerprint = 'seed-fp-users-groups-undefined-map';
  const sampleFix = await prisma.bugFix.upsert({
    where: { id: 'seed-fix-1' },
    update: {},
    create: {
      id: 'seed-fix-1',
      orgId: org.id,
      fingerprint: sampleFingerprint,
      title: 'Users/Groups page crashes on null groups relation',
      rootCause:
        'The users list endpoint did not include the `groups` relation in its Prisma select, so the web mapper called .map() on undefined and threw a TypeError.',
      resolution:
        'Added `groups` to the API SAFE_SELECT and guarded the mapper with `(u.groups ?? [])` so a missing relation degrades to an empty list instead of crashing.',
      prevention:
        'When a UI field maps over a relation, ensure the API selects that relation and the mapper null-guards it. Add a smoke test that renders the page in live mode.',
      filesTouched: [
        'apps/api/src/modules/users/users.service.ts',
        'apps/web/src/lib/api/map.ts',
      ],
      authoredBy: 'AI',
      authorName: 'Claude Code',
      tags: ['web', 'api', 'null-safety'],
      reusedCount: 0,
    },
  });
  await prisma.bugReport.upsert({
    where: { id: 'seed-bug-1' },
    update: {},
    create: {
      id: 'seed-bug-1',
      orgId: org.id,
      source: 'USER',
      status: 'RESOLVED',
      severity: 'HIGH',
      title: 'Access → Users and Groups show an error message',
      description:
        'Opening Access → Users (or Groups) renders a red error instead of the table. Happens every time on a fresh login.',
      fingerprint: sampleFingerprint,
      errorCode: 'ERR-USRGRP01',
      component: 'web',
      route: '/users',
      reporterEmail: ADMIN_EMAIL,
      fixId: sampleFix.id,
      resolvedAt: new Date(),
      occurrences: 3,
    },
  });
  // An open, automatically-captured crash awaiting triage by an AI/operator.
  await prisma.bugReport.upsert({
    where: { id: 'seed-bug-2' },
    update: {},
    create: {
      id: 'seed-bug-2',
      orgId: org.id,
      source: 'AUTOMATIC',
      status: 'OPEN',
      severity: 'CRITICAL',
      title: 'TypeError: Cannot read properties of undefined (reading "id")',
      description: 'Unhandled exception captured automatically by the API exception filter.',
      errorName: 'TypeError',
      errorCode: 'ERR-9F2C71A4',
      stackTrace:
        'TypeError: Cannot read properties of undefined (reading "id")\n    at SessionsService.connection (sessions.service.ts:212:31)\n    at SessionsController.connection (sessions.controller.ts:88:24)',
      fingerprint: 'seed-fp-sessions-connection-undefined-id',
      component: 'api',
      route: '/api/v1/sessions/abc123/connection',
      httpStatus: 500,
      occurrences: 7,
    },
  });

  console.log('\n✓ Seed complete.');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │  Admin login                                  │');
  console.log(`  │  email:    ${ADMIN_EMAIL.padEnd(34)}│`);
  console.log(`  │  password: ${ADMIN_PASSWORD.padEnd(34)}│`);
  console.log('  └──────────────────────────────────────────────┘');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
