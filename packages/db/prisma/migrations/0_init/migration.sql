-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED', 'INVITED', 'LOCKED', 'DEMO');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('PASSWORD', 'WEBAUTHN');

-- CreateEnum
CREATE TYPE "AccountRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "TwoFactorType" AS ENUM ('TOTP', 'WEBAUTHN', 'HARDWARE_TOKEN');

-- CreateEnum
CREATE TYPE "AuthProviderType" AS ENUM ('LOCAL', 'LDAP', 'SAML', 'OIDC');

-- CreateEnum
CREATE TYPE "WorkspaceType" AS ENUM ('CONTAINER', 'SERVER', 'REMOTE_APP', 'VM', 'LINK');

-- CreateEnum
CREATE TYPE "ImageChannel" AS ENUM ('CORE', 'ROLLING', 'CUSTOM');

-- CreateEnum
CREATE TYPE "StreamProtocol" AS ENUM ('KASMVNC', 'RDP', 'VNC', 'SSH', 'WEBRTC');

-- CreateEnum
CREATE TYPE "RegistryType" AS ENUM ('FIRST_PARTY', 'THIRD_PARTY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('REQUESTED', 'SCHEDULED', 'PROVISIONING', 'RUNNING', 'DEGRADED', 'PAUSED', 'TERMINATING', 'DESTROYED', 'ERROR');

-- CreateEnum
CREATE TYPE "ConnectionType" AS ENUM ('KASMVNC', 'NEKO_WEBRTC', 'GUAC_RDP', 'GUAC_VNC', 'GUAC_SSH');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('RECORDING', 'FINALIZING', 'AVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "AgentKind" AS ENUM ('DOCKER', 'COMPUTE');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ONLINE', 'OFFLINE', 'DRAINING', 'UNHEALTHY');

-- CreateEnum
CREATE TYPE "ServerConnectionType" AS ENUM ('SSH', 'RDP', 'VNC');

-- CreateEnum
CREATE TYPE "ServerAuthMode" AS ENUM ('PASSWORD', 'KEY', 'VMWARE_TEMPLATE');

-- CreateEnum
CREATE TYPE "ContinuityMode" AS ENUM ('NONE', 'TMUX', 'SCREEN');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'PROVISIONING', 'ERROR');

-- CreateEnum
CREATE TYPE "PoolKind" AS ENUM ('SERVER', 'AGENT');

-- CreateEnum
CREATE TYPE "AutoscaleMode" AS ENUM ('SCHEDULE', 'LOAD', 'ACTIVE_DIRECTORY');

-- CreateEnum
CREATE TYPE "VMProviderType" AS ENUM ('AWS', 'AZURE', 'DIGITALOCEAN', 'GCP', 'HARVESTER', 'ORACLE', 'NUTANIX', 'PROXMOX', 'VSPHERE', 'OPENSTACK', 'KUBEVIRT');

-- CreateEnum
CREATE TYPE "DNSProviderType" AS ENUM ('AWS', 'AZURE', 'DIGITALOCEAN', 'GCP', 'ORACLE');

-- CreateEnum
CREATE TYPE "ConnectionProxyType" AS ENUM ('GUACAMOLE', 'RDP_GATEWAY', 'RDP_HTTPS_GATEWAY', 'NATIVE_RDP');

-- CreateEnum
CREATE TYPE "StorageKind" AS ENUM ('DROPBOX', 'GDRIVE', 'NEXTCLOUD', 'ONEDRIVE', 'S3', 'CUSTOM');

-- CreateEnum
CREATE TYPE "FileMappingTarget" AS ENUM ('CONTAINER', 'WINDOWS');

-- CreateEnum
CREATE TYPE "PersistBackend" AS ENUM ('DOCKER_VOLUME', 'S3');

-- CreateEnum
CREATE TYPE "SettingScope" AS ENUM ('GLOBAL', 'ORG', 'ZONE');

-- CreateEnum
CREATE TYPE "BrandingScope" AS ENUM ('GLOBAL', 'ORG', 'GROUP');

-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('CONCURRENT', 'NAMED_USER');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');

-- CreateEnum
CREATE TYPE "AssignmentScope" AS ENUM ('USER', 'GROUP', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "BugSource" AS ENUM ('USER', 'AUTOMATIC');

-- CreateEnum
CREATE TYPE "BugSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "BugStatus" AS ENUM ('OPEN', 'TRIAGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'WONT_FIX', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "FixAuthorKind" AS ENUM ('AI', 'HUMAN');

-- CreateEnum
CREATE TYPE "ImagePullPolicy" AS ENUM ('ALWAYS', 'IF_NOT_PRESENT', 'NEVER');

-- CreateEnum
CREATE TYPE "TariffPeriod" AS ENUM ('MINUTE', 'HOUR', 'MONTH');

-- CreateEnum
CREATE TYPE "TariffSubject" AS ENUM ('ORG', 'GROUP', 'USER');

-- CreateEnum
CREATE TYPE "FeedbackKind" AS ENUM ('BUG', 'FEEDBACK');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'FIXED', 'WONTFIX');

-- CreateEnum
CREATE TYPE "MaintenanceTaskType" AS ENUM ('REAP_DEAD_SESSIONS', 'REAP_ABANDONED_SESSIONS', 'PRUNE_DEAD_AGENTS', 'RESTART_AGENTS', 'RESTART_CONNECTION_PROXY', 'PRUNE_AGENT_IMAGES');

-- CreateEnum
CREATE TYPE "ScheduleKind" AS ENUM ('INTERVAL', 'DAILY', 'WEEKLY');

-- CreateEnum
CREATE TYPE "MaintenanceRunStatus" AS ENUM ('RUNNING', 'OK', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MaintenanceTrigger" AS ENUM ('SCHEDULE', 'MANUAL');

-- CreateTable
CREATE TABLE "RegistrationToken" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "zoneId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "licenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeploymentZone" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "proxyBaseUrl" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeploymentZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "externalId" TEXT,
    "federatedFrom" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isSystemAdmin" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "lastLoginAt" TIMESTAMP(3),
    "demoExpiresAt" TIMESTAMP(3),
    "deactivatesAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoGrant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "ip" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "reason" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "AccountRequestStatus" NOT NULL DEFAULT 'PENDING',
    "ip" TEXT,
    "userAgent" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "CredentialKind" NOT NULL DEFAULT 'PASSWORD',
    "secret" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TwoFactorMethod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TwoFactorType" NOT NULL,
    "label" TEXT,
    "secret" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TwoFactorMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "keepaliveExpirationSec" INTEGER,
    "idleDisconnectSec" INTEGER,
    "usageLimitSec" INTEGER,
    "maxConcurrentSessions" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceUser" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GroupRole" (
    "groupId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "GroupRole_pkey" PRIMARY KEY ("groupId","roleId")
);

-- CreateTable
CREATE TABLE "SsoMapping" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authConfigId" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SsoMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "AuthProviderType" NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "noticeTitle" TEXT,
    "noticeBody" TEXT,
    "noticeRequireAck" BOOLEAN NOT NULL DEFAULT false,
    "assistanceText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoginConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaptchaConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT NOT NULL DEFAULT 'recaptcha',
    "siteKey" TEXT,
    "secretRef" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaptchaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "description" TEXT,
    "type" "WorkspaceType" NOT NULL DEFAULT 'CONTAINER',
    "imageId" TEXT,
    "serverId" TEXT,
    "zoneId" TEXT,
    "iconUrl" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dockerConfig" JSONB NOT NULL DEFAULT '{}',
    "coresLimit" DOUBLE PRECISION,
    "memLimitMb" INTEGER,
    "gpuCount" INTEGER NOT NULL DEFAULT 0,
    "maxDurationMinutes" INTEGER,
    "idleTimeoutMinutes" INTEGER,
    "minuteCostFactor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "dlp" JSONB NOT NULL DEFAULT '{}',
    "gpu" JSONB NOT NULL DEFAULT '{}',
    "launchSchema" JSONB,
    "webFilterId" TEXT,
    "egressGatewayId" TEXT,
    "browserIsolationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Image" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "dockerImage" TEXT NOT NULL,
    "channel" "ImageChannel" NOT NULL DEFAULT 'CUSTOM',
    "protocol" "StreamProtocol" NOT NULL DEFAULT 'KASMVNC',
    "architecture" TEXT NOT NULL DEFAULT 'amd64',
    "digest" TEXT,
    "pullPolicy" "ImagePullPolicy" NOT NULL DEFAULT 'ALWAYS',
    "available" BOOLEAN NOT NULL DEFAULT true,
    "runConfigDefaults" JSONB NOT NULL DEFAULT '{}',
    "sourceRegistryEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Registry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" "RegistryType" NOT NULL DEFAULT 'THIRD_PARTY',
    "schemaVersion" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistryEntry" (
    "id" TEXT NOT NULL,
    "registryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "friendlyName" TEXT NOT NULL,
    "description" TEXT,
    "dockerImage" TEXT NOT NULL,
    "iconUrl" TEXT,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "raw" JSONB NOT NULL DEFAULT '{}',
    "installed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,

    CONSTRAINT "WorkspaceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RemoteApp" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "args" TEXT,

    CONSTRAINT "RemoteApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LaunchForm" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schema" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaunchForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kasmId" TEXT NOT NULL,
    "userId" TEXT,
    "stagingId" TEXT,
    "workspaceId" TEXT,
    "imageId" TEXT,
    "zoneId" TEXT,
    "agentId" TEXT,
    "serverId" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'REQUESTED',
    "connectionType" "ConnectionType" NOT NULL DEFAULT 'KASMVNC',
    "workspaceName" TEXT,
    "imageName" TEXT,
    "containerId" TEXT,
    "internalHost" TEXT,
    "host" TEXT,
    "port" INTEGER,
    "traefikRouterName" TEXT,
    "connectionUrl" TEXT,
    "launchValues" JSONB NOT NULL DEFAULT '{}',
    "resources" JSONB NOT NULL DEFAULT '{}',
    "streamProfile" JSONB NOT NULL DEFAULT '{}',
    "recordingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "persistentProfileId" TEXT,
    "shareEnabled" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "terminationReason" TEXT,
    "startedAt" TIMESTAMP(3),
    "lastKeepaliveAt" TIMESTAMP(3),
    "idleSince" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "consumedSeconds" INTEGER NOT NULL DEFAULT 0,
    "destroyedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionControlEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionControlEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Screenshot" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Screenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "protocol" "StreamProtocol" NOT NULL,
    "storageMappingId" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'RECORDING',
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingArtifact" (
    "id" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "segmentNo" INTEGER,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionShare" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "shareKey" TEXT NOT NULL,
    "allowControl" BOOLEAN NOT NULL DEFAULT false,
    "requireAuth" BOOLEAN NOT NULL DEFAULT true,
    "enableChat" BOOLEAN NOT NULL DEFAULT true,
    "enableAv" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "SessionShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareParticipant" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "userId" TEXT,
    "guestName" TEXT,
    "canControl" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ShareParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShareChatMessage" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionStaging" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "desiredSessions" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastError" TEXT,
    "lastReconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionStaging_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CastingConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "allowAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "requireAuth" BOOLEAN NOT NULL DEFAULT true,
    "groupId" TEXT,
    "errorPageId" TEXT,
    "maxConcurrent" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CastingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CastErrorPage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "html" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CastErrorPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "address" TEXT,
    "kind" "AgentKind" NOT NULL DEFAULT 'DOCKER',
    "status" "AgentStatus" NOT NULL DEFAULT 'OFFLINE',
    "drainRequested" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT,
    "apiKeyId" TEXT,
    "cpuCores" INTEGER NOT NULL DEFAULT 0,
    "memTotalMb" INTEGER NOT NULL DEFAULT 0,
    "memFreeMb" INTEGER NOT NULL DEFAULT 0,
    "cpuOverrideFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "memOverrideFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "maxSessions" INTEGER NOT NULL DEFAULT 0,
    "currentSessions" INTEGER NOT NULL DEFAULT 0,
    "loadPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "labels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastHeartbeatAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GpuDevice" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "model" TEXT,
    "memoryMb" INTEGER NOT NULL DEFAULT 0,
    "inUse" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GpuDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "connectionType" "ServerConnectionType" NOT NULL DEFAULT 'RDP',
    "authMode" "ServerAuthMode" NOT NULL DEFAULT 'PASSWORD',
    "credentialRef" TEXT,
    "continuity" "ContinuityMode" NOT NULL DEFAULT 'NONE',
    "vmTemplate" TEXT,
    "vmProviderId" TEXT,
    "status" "ServerStatus" NOT NULL DEFAULT 'OFFLINE',
    "maxSessions" INTEGER NOT NULL DEFAULT 1,
    "lastSeenAt" TIMESTAMP(3),
    "agentVersion" TEXT,
    "tunnelIp" TEXT,
    "tunnelPublicKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerPool" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PoolKind" NOT NULL DEFAULT 'AGENT',
    "startupScript" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServerPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerPoolMember" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "serverId" TEXT,
    "agentId" TEXT,

    CONSTRAINT "ServerPoolMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscaleConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "serverPoolId" TEXT NOT NULL,
    "mode" "AutoscaleMode" NOT NULL DEFAULT 'SCHEDULE',
    "minStandby" INTEGER NOT NULL DEFAULT 0,
    "maxInstances" INTEGER NOT NULL DEFAULT 1,
    "perServerSessionLimit" INTEGER NOT NULL DEFAULT 1,
    "checkinIntervalSec" INTEGER NOT NULL DEFAULT 60,
    "downscaleBackoffSec" INTEGER NOT NULL DEFAULT 300,
    "vmProviderId" TEXT,
    "dnsProviderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoscaleConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AutoscaleSchedule" (
    "id" TEXT NOT NULL,
    "autoscaleConfigId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "hour" INTEGER NOT NULL,
    "minStandby" INTEGER NOT NULL DEFAULT 0,
    "maxInstances" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "AutoscaleSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VMProvider" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "VMProviderType" NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretRef" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VMProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DNSProvider" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "DNSProviderType" NOT NULL,
    "zoneName" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretRef" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DNSProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectionProxyConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ConnectionProxyType" NOT NULL DEFAULT 'GUACAMOLE',
    "host" TEXT,
    "port" INTEGER,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectionProxyConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EgressGateway" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretRef" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EgressGateway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebFilterConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categories" JSONB NOT NULL DEFAULT '{}',
    "cacheTtl" INTEGER NOT NULL DEFAULT 3600,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebFilterConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrowserIsolationConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "forwardProxy" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrowserIsolationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StorageMapping" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "StorageKind" NOT NULL,
    "mountPath" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "scope" "AssignmentScope" NOT NULL DEFAULT 'GROUP',
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretRef" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StorageMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileMapping" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target" "FileMappingTarget" NOT NULL DEFAULT 'CONTAINER',
    "sourcePath" TEXT NOT NULL,
    "destPath" TEXT NOT NULL,
    "owner" TEXT,
    "group" TEXT,
    "mode" TEXT,
    "isHomeProfile" BOOLEAN NOT NULL DEFAULT false,
    "scope" "AssignmentScope" NOT NULL DEFAULT 'WORKSPACE',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersistentProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "volumeName" TEXT NOT NULL,
    "backend" "PersistBackend" NOT NULL DEFAULT 'DOCKER_VOLUME',
    "sizeLimitMb" INTEGER,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersistentProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolumeMapping" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hostPath" TEXT NOT NULL,
    "destPath" TEXT NOT NULL,
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolumeMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "scope" "SettingScope" NOT NULL DEFAULT 'GLOBAL',
    "orgId" TEXT,
    "zoneId" TEXT,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL DEFAULT '{}',
    "type" TEXT NOT NULL DEFAULT 'json',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Branding" (
    "id" TEXT NOT NULL,
    "scope" "BrandingScope" NOT NULL DEFAULT 'ORG',
    "orgId" TEXT,
    "groupId" TEXT,
    "productName" TEXT NOT NULL DEFAULT 'Asha',
    "logoUrl" TEXT,
    "faviconUrl" TEXT,
    "loginBackgroundUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1a1a2e',
    "accentColor" TEXT NOT NULL DEFAULT '#d4af37',
    "customCss" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Branding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExperimentalFeature" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'preview',
    "sinceVersion" TEXT,
    "enabledByDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperimentalFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgFeatureFlag" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "acceptedRisk" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgFeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageBuildJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestedTag" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "outputImage" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImageBuildJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannerWatermarkConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scope" "AssignmentScope" NOT NULL DEFAULT 'GROUP',
    "refId" TEXT,
    "bannerText" TEXT,
    "bannerColor" TEXT,
    "watermarkText" TEXT,
    "watermarkOpacity" DOUBLE PRECISION NOT NULL DEFAULT 0.15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BannerWatermarkConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "type" "LicenseType" NOT NULL DEFAULT 'CONCURRENT',
    "seats" INTEGER NOT NULL DEFAULT 5,
    "concurrentSessions" INTEGER NOT NULL DEFAULT 5,
    "issuedTo" TEXT,
    "notBefore" TIMESTAMP(3),
    "notAfter" TIMESTAMP(3),
    "signature" TEXT,
    "features" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseUsageSample" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "concurrentSessions" INTEGER NOT NULL,
    "namedUsers" INTEGER NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseUsageSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "period" "TariffPeriod" NOT NULL DEFAULT 'MONTH',
    "budgetMinutes" INTEGER,
    "maxSessionMinutes" INTEGER,
    "maxConcurrent" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffAssignment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "subjectType" "TariffSubject" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "remainingSeconds" INTEGER NOT NULL DEFAULT 0,
    "periodResetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TariffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "responseCode" INTEGER,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "actorUserId" TEXT,
    "actorApiKeyId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSample" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "refId" TEXT,
    "metric" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "sampledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogForwarderConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "endpoint" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "secretRef" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogForwarderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigExportBundle" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConfigExportBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DbBackupRecord" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "bytes" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DbBackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "FeedbackKind" NOT NULL DEFAULT 'FEEDBACK',
    "message" TEXT NOT NULL,
    "pageUrl" TEXT,
    "screenshot" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'OPEN',
    "notes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugReport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "source" "BugSource" NOT NULL DEFAULT 'USER',
    "status" "BugStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "BugSeverity" NOT NULL DEFAULT 'MEDIUM',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "errorCode" TEXT,
    "errorName" TEXT,
    "stackTrace" TEXT,
    "fingerprint" TEXT,
    "component" TEXT,
    "route" TEXT,
    "httpStatus" INTEGER,
    "userAgent" TEXT,
    "appVersion" TEXT,
    "reportedById" TEXT,
    "reporterEmail" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "fixId" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BugFix" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "fingerprint" TEXT,
    "title" TEXT NOT NULL,
    "rootCause" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "prevention" TEXT,
    "filesTouched" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commitRef" TEXT,
    "authoredBy" "FixAuthorKind" NOT NULL DEFAULT 'AI',
    "authorName" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reusedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BugFix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceTask" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "type" "MaintenanceTaskType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleKind" "ScheduleKind" NOT NULL DEFAULT 'INTERVAL',
    "intervalMinutes" INTEGER,
    "atMinuteOfDay" INTEGER,
    "weekday" INTEGER,
    "params" JSONB NOT NULL DEFAULT '{}',
    "lastRunAt" TIMESTAMP(3),
    "lastStatus" "MaintenanceRunStatus",
    "lastSummary" TEXT,
    "lastError" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceRun" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "orgId" TEXT,
    "status" "MaintenanceRunStatus" NOT NULL DEFAULT 'RUNNING',
    "trigger" "MaintenanceTrigger" NOT NULL DEFAULT 'SCHEDULE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "summary" TEXT,
    "affected" INTEGER,
    "error" TEXT,
    "actorUserId" TEXT,

    CONSTRAINT "MaintenanceRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GroupWorkspaces" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_GroupWorkspaces_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "RegistrationToken_tokenHash_key" ON "RegistrationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RegistrationToken_orgId_idx" ON "RegistrationToken"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Org_slug_key" ON "Org"("slug");

-- CreateIndex
CREATE INDEX "DeploymentZone_orgId_idx" ON "DeploymentZone"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DeploymentZone_orgId_name_key" ON "DeploymentZone"("orgId", "name");

-- CreateIndex
CREATE INDEX "User_orgId_idx" ON "User"("orgId");

-- CreateIndex
CREATE INDEX "User_status_deactivatesAt_idx" ON "User"("status", "deactivatesAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_email_key" ON "User"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_orgId_username_key" ON "User"("orgId", "username");

-- CreateIndex
CREATE INDEX "DemoGrant_orgId_idx" ON "DemoGrant"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DemoGrant_orgId_email_key" ON "DemoGrant"("orgId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "DemoGrant_orgId_fingerprintHash_key" ON "DemoGrant"("orgId", "fingerprintHash");

-- CreateIndex
CREATE INDEX "AccountRequest_orgId_status_idx" ON "AccountRequest"("orgId", "status");

-- CreateIndex
CREATE INDEX "AccountRequest_status_createdAt_idx" ON "AccountRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AccountRequest_orgId_email_key" ON "AccountRequest"("orgId", "email");

-- CreateIndex
CREATE INDEX "UserCredential_userId_idx" ON "UserCredential"("userId");

-- CreateIndex
CREATE INDEX "TwoFactorMethod_userId_idx" ON "TwoFactorMethod"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

-- CreateIndex
CREATE INDEX "ApiKey_orgId_idx" ON "ApiKey"("orgId");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "ApiKey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSetting_userId_key_key" ON "UserSetting"("userId", "key");

-- CreateIndex
CREATE INDEX "Group_orgId_idx" ON "Group"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Group_orgId_name_key" ON "Group"("orgId", "name");

-- CreateIndex
CREATE INDEX "Role_orgId_idx" ON "Role"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_orgId_name_key" ON "Role"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "UserGroup_orgId_idx" ON "UserGroup"("orgId");

-- CreateIndex
CREATE INDEX "UserGroup_groupId_idx" ON "UserGroup"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "UserGroup_userId_groupId_key" ON "UserGroup"("userId", "groupId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_orgId_idx" ON "WorkspaceUser"("orgId");

-- CreateIndex
CREATE INDEX "WorkspaceUser_userId_idx" ON "WorkspaceUser"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUser_workspaceId_userId_key" ON "WorkspaceUser"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "GroupRole_roleId_idx" ON "GroupRole"("roleId");

-- CreateIndex
CREATE INDEX "SsoMapping_orgId_idx" ON "SsoMapping"("orgId");

-- CreateIndex
CREATE INDEX "SsoMapping_groupId_idx" ON "SsoMapping"("groupId");

-- CreateIndex
CREATE INDEX "AuthConfig_orgId_idx" ON "AuthConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthConfig_orgId_name_key" ON "AuthConfig"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LoginConfig_orgId_key" ON "LoginConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "CaptchaConfig_orgId_key" ON "CaptchaConfig"("orgId");

-- CreateIndex
CREATE INDEX "Workspace_orgId_idx" ON "Workspace"("orgId");

-- CreateIndex
CREATE INDEX "Workspace_imageId_idx" ON "Workspace"("imageId");

-- CreateIndex
CREATE INDEX "Workspace_serverId_idx" ON "Workspace"("serverId");

-- CreateIndex
CREATE INDEX "Workspace_zoneId_idx" ON "Workspace"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_orgId_name_key" ON "Workspace"("orgId", "name");

-- CreateIndex
CREATE INDEX "Image_orgId_idx" ON "Image"("orgId");

-- CreateIndex
CREATE INDEX "Registry_orgId_idx" ON "Registry"("orgId");

-- CreateIndex
CREATE INDEX "RegistryEntry_registryId_idx" ON "RegistryEntry"("registryId");

-- CreateIndex
CREATE INDEX "WorkspaceLink_workspaceId_idx" ON "WorkspaceLink"("workspaceId");

-- CreateIndex
CREATE INDEX "RemoteApp_workspaceId_idx" ON "RemoteApp"("workspaceId");

-- CreateIndex
CREATE INDEX "LaunchForm_workspaceId_idx" ON "LaunchForm"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_kasmId_key" ON "Session"("kasmId");

-- CreateIndex
CREATE INDEX "Session_orgId_status_idx" ON "Session"("orgId", "status");

-- CreateIndex
CREATE INDEX "Session_agentId_status_idx" ON "Session"("agentId", "status");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_workspaceId_idx" ON "Session"("workspaceId");

-- CreateIndex
CREATE INDEX "Session_zoneId_idx" ON "Session"("zoneId");

-- CreateIndex
CREATE INDEX "Session_stagingId_idx" ON "Session"("stagingId");

-- CreateIndex
CREATE INDEX "SessionControlEvent_sessionId_idx" ON "SessionControlEvent"("sessionId");

-- CreateIndex
CREATE INDEX "Screenshot_sessionId_idx" ON "Screenshot"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_sessionId_key" ON "Recording"("sessionId");

-- CreateIndex
CREATE INDEX "Recording_orgId_idx" ON "Recording"("orgId");

-- CreateIndex
CREATE INDEX "RecordingArtifact_recordingId_idx" ON "RecordingArtifact"("recordingId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionShare_sessionId_key" ON "SessionShare"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionShare_shareKey_key" ON "SessionShare"("shareKey");

-- CreateIndex
CREATE INDEX "SessionShare_orgId_idx" ON "SessionShare"("orgId");

-- CreateIndex
CREATE INDEX "ShareParticipant_shareId_idx" ON "ShareParticipant"("shareId");

-- CreateIndex
CREATE INDEX "ShareChatMessage_shareId_idx" ON "ShareChatMessage"("shareId");

-- CreateIndex
CREATE INDEX "SessionStaging_orgId_idx" ON "SessionStaging"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "SessionStaging_workspaceId_zoneId_key" ON "SessionStaging"("workspaceId", "zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "CastingConfig_key_key" ON "CastingConfig"("key");

-- CreateIndex
CREATE INDEX "CastingConfig_orgId_idx" ON "CastingConfig"("orgId");

-- CreateIndex
CREATE INDEX "CastingConfig_workspaceId_idx" ON "CastingConfig"("workspaceId");

-- CreateIndex
CREATE INDEX "CastErrorPage_orgId_idx" ON "CastErrorPage"("orgId");

-- CreateIndex
CREATE INDEX "Agent_orgId_status_idx" ON "Agent"("orgId", "status");

-- CreateIndex
CREATE INDEX "Agent_zoneId_idx" ON "Agent"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_orgId_hostname_key" ON "Agent"("orgId", "hostname");

-- CreateIndex
CREATE INDEX "GpuDevice_agentId_idx" ON "GpuDevice"("agentId");

-- CreateIndex
CREATE INDEX "Server_orgId_idx" ON "Server"("orgId");

-- CreateIndex
CREATE INDEX "Server_zoneId_idx" ON "Server"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_orgId_hostname_key" ON "Server"("orgId", "hostname");

-- CreateIndex
CREATE INDEX "ServerPool_orgId_idx" ON "ServerPool"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerPool_orgId_name_key" ON "ServerPool"("orgId", "name");

-- CreateIndex
CREATE INDEX "ServerPoolMember_poolId_idx" ON "ServerPoolMember"("poolId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscaleConfig_serverPoolId_key" ON "AutoscaleConfig"("serverPoolId");

-- CreateIndex
CREATE INDEX "AutoscaleConfig_orgId_idx" ON "AutoscaleConfig"("orgId");

-- CreateIndex
CREATE INDEX "AutoscaleSchedule_autoscaleConfigId_idx" ON "AutoscaleSchedule"("autoscaleConfigId");

-- CreateIndex
CREATE UNIQUE INDEX "AutoscaleSchedule_autoscaleConfigId_dayOfWeek_hour_key" ON "AutoscaleSchedule"("autoscaleConfigId", "dayOfWeek", "hour");

-- CreateIndex
CREATE INDEX "VMProvider_orgId_idx" ON "VMProvider"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "VMProvider_orgId_name_key" ON "VMProvider"("orgId", "name");

-- CreateIndex
CREATE INDEX "DNSProvider_orgId_idx" ON "DNSProvider"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "DNSProvider_orgId_name_key" ON "DNSProvider"("orgId", "name");

-- CreateIndex
CREATE INDEX "ConnectionProxyConfig_orgId_idx" ON "ConnectionProxyConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectionProxyConfig_orgId_name_key" ON "ConnectionProxyConfig"("orgId", "name");

-- CreateIndex
CREATE INDEX "EgressGateway_orgId_idx" ON "EgressGateway"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "EgressGateway_orgId_name_key" ON "EgressGateway"("orgId", "name");

-- CreateIndex
CREATE INDEX "WebFilterConfig_orgId_idx" ON "WebFilterConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "WebFilterConfig_orgId_name_key" ON "WebFilterConfig"("orgId", "name");

-- CreateIndex
CREATE INDEX "BrowserIsolationConfig_orgId_idx" ON "BrowserIsolationConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "BrowserIsolationConfig_orgId_name_key" ON "BrowserIsolationConfig"("orgId", "name");

-- CreateIndex
CREATE INDEX "StorageMapping_orgId_idx" ON "StorageMapping"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "StorageMapping_orgId_name_key" ON "StorageMapping"("orgId", "name");

-- CreateIndex
CREATE INDEX "FileMapping_orgId_idx" ON "FileMapping"("orgId");

-- CreateIndex
CREATE INDEX "FileMapping_userId_idx" ON "FileMapping"("userId");

-- CreateIndex
CREATE INDEX "PersistentProfile_orgId_idx" ON "PersistentProfile"("orgId");

-- CreateIndex
CREATE INDEX "PersistentProfile_userId_idx" ON "PersistentProfile"("userId");

-- CreateIndex
CREATE INDEX "VolumeMapping_orgId_idx" ON "VolumeMapping"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "VolumeMapping_orgId_name_key" ON "VolumeMapping"("orgId", "name");

-- CreateIndex
CREATE INDEX "Setting_orgId_idx" ON "Setting"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_scope_orgId_zoneId_key_key" ON "Setting"("scope", "orgId", "zoneId", "key");

-- CreateIndex
CREATE INDEX "Branding_orgId_idx" ON "Branding"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Branding_scope_orgId_groupId_key" ON "Branding"("scope", "orgId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "ExperimentalFeature_name_key" ON "ExperimentalFeature"("name");

-- CreateIndex
CREATE INDEX "OrgFeatureFlag_orgId_idx" ON "OrgFeatureFlag"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "OrgFeatureFlag_orgId_featureId_key" ON "OrgFeatureFlag"("orgId", "featureId");

-- CreateIndex
CREATE INDEX "ImageBuildJob_orgId_idx" ON "ImageBuildJob"("orgId");

-- CreateIndex
CREATE INDEX "ImageBuildJob_sessionId_idx" ON "ImageBuildJob"("sessionId");

-- CreateIndex
CREATE INDEX "BannerWatermarkConfig_orgId_idx" ON "BannerWatermarkConfig"("orgId");

-- CreateIndex
CREATE INDEX "License_orgId_idx" ON "License"("orgId");

-- CreateIndex
CREATE INDEX "LicenseUsageSample_licenseId_idx" ON "LicenseUsageSample"("licenseId");

-- CreateIndex
CREATE INDEX "Tariff_orgId_idx" ON "Tariff"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Tariff_orgId_name_key" ON "Tariff"("orgId", "name");

-- CreateIndex
CREATE INDEX "TariffAssignment_orgId_idx" ON "TariffAssignment"("orgId");

-- CreateIndex
CREATE INDEX "TariffAssignment_tariffId_idx" ON "TariffAssignment"("tariffId");

-- CreateIndex
CREATE UNIQUE INDEX "TariffAssignment_orgId_subjectType_subjectId_key" ON "TariffAssignment"("orgId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "Webhook_orgId_idx" ON "Webhook"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Webhook_orgId_name_key" ON "Webhook"("orgId", "name");

-- CreateIndex
CREATE INDEX "WebhookDelivery_webhookId_idx" ON "WebhookDelivery"("webhookId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "MetricSample_orgId_metric_sampledAt_idx" ON "MetricSample"("orgId", "metric", "sampledAt");

-- CreateIndex
CREATE INDEX "MetricSample_scope_refId_idx" ON "MetricSample"("scope", "refId");

-- CreateIndex
CREATE INDEX "LogForwarderConfig_orgId_idx" ON "LogForwarderConfig"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "LogForwarderConfig_orgId_name_key" ON "LogForwarderConfig"("orgId", "name");

-- CreateIndex
CREATE INDEX "ConfigExportBundle_orgId_idx" ON "ConfigExportBundle"("orgId");

-- CreateIndex
CREATE INDEX "Feedback_orgId_idx" ON "Feedback"("orgId");

-- CreateIndex
CREATE INDEX "Feedback_status_idx" ON "Feedback"("status");

-- CreateIndex
CREATE INDEX "BugReport_orgId_status_idx" ON "BugReport"("orgId", "status");

-- CreateIndex
CREATE INDEX "BugReport_source_status_idx" ON "BugReport"("source", "status");

-- CreateIndex
CREATE INDEX "BugReport_fingerprint_idx" ON "BugReport"("fingerprint");

-- CreateIndex
CREATE INDEX "BugReport_errorCode_idx" ON "BugReport"("errorCode");

-- CreateIndex
CREATE INDEX "BugFix_orgId_idx" ON "BugFix"("orgId");

-- CreateIndex
CREATE INDEX "BugFix_fingerprint_idx" ON "BugFix"("fingerprint");

-- CreateIndex
CREATE INDEX "MaintenanceTask_orgId_enabled_idx" ON "MaintenanceTask"("orgId", "enabled");

-- CreateIndex
CREATE INDEX "MaintenanceTask_type_idx" ON "MaintenanceTask"("type");

-- CreateIndex
CREATE INDEX "MaintenanceRun_taskId_startedAt_idx" ON "MaintenanceRun"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "MaintenanceRun_orgId_idx" ON "MaintenanceRun"("orgId");

-- CreateIndex
CREATE INDEX "_GroupWorkspaces_B_index" ON "_GroupWorkspaces"("B");

-- AddForeignKey
ALTER TABLE "UserCredential" ADD CONSTRAINT "UserCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TwoFactorMethod" ADD CONSTRAINT "TwoFactorMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSetting" ADD CONSTRAINT "UserSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRole" ADD CONSTRAINT "GroupRole_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GroupRole" ADD CONSTRAINT "GroupRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SsoMapping" ADD CONSTRAINT "SsoMapping_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeploymentZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_webFilterId_fkey" FOREIGN KEY ("webFilterId") REFERENCES "WebFilterConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_egressGatewayId_fkey" FOREIGN KEY ("egressGatewayId") REFERENCES "EgressGateway"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_browserIsolationId_fkey" FOREIGN KEY ("browserIsolationId") REFERENCES "BrowserIsolationConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistryEntry" ADD CONSTRAINT "RegistryEntry_registryId_fkey" FOREIGN KEY ("registryId") REFERENCES "Registry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceLink" ADD CONSTRAINT "WorkspaceLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RemoteApp" ADD CONSTRAINT "RemoteApp_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LaunchForm" ADD CONSTRAINT "LaunchForm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeploymentZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionControlEvent" ADD CONSTRAINT "SessionControlEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screenshot" ADD CONSTRAINT "Screenshot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingArtifact" ADD CONSTRAINT "RecordingArtifact_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionShare" ADD CONSTRAINT "SessionShare_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareParticipant" ADD CONSTRAINT "ShareParticipant_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "SessionShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareChatMessage" ADD CONSTRAINT "ShareChatMessage_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "SessionShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionStaging" ADD CONSTRAINT "SessionStaging_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CastingConfig" ADD CONSTRAINT "CastingConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeploymentZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GpuDevice" ADD CONSTRAINT "GpuDevice_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Server" ADD CONSTRAINT "Server_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeploymentZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerPoolMember" ADD CONSTRAINT "ServerPoolMember_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "ServerPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscaleConfig" ADD CONSTRAINT "AutoscaleConfig_serverPoolId_fkey" FOREIGN KEY ("serverPoolId") REFERENCES "ServerPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AutoscaleSchedule" ADD CONSTRAINT "AutoscaleSchedule_autoscaleConfigId_fkey" FOREIGN KEY ("autoscaleConfigId") REFERENCES "AutoscaleConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileMapping" ADD CONSTRAINT "FileMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgFeatureFlag" ADD CONSTRAINT "OrgFeatureFlag_featureId_fkey" FOREIGN KEY ("featureId") REFERENCES "ExperimentalFeature"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LicenseUsageSample" ADD CONSTRAINT "LicenseUsageSample_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffAssignment" ADD CONSTRAINT "TariffAssignment_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BugReport" ADD CONSTRAINT "BugReport_fixId_fkey" FOREIGN KEY ("fixId") REFERENCES "BugFix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceRun" ADD CONSTRAINT "MaintenanceRun_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "MaintenanceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupWorkspaces" ADD CONSTRAINT "_GroupWorkspaces_A_fkey" FOREIGN KEY ("A") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupWorkspaces" ADD CONSTRAINT "_GroupWorkspaces_B_fkey" FOREIGN KEY ("B") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

