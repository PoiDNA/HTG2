import {
  AccessToken,
  RoomServiceClient,
  EgressClient,
  WebhookReceiver,
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
} from 'livekit-server-sdk';
import type { VideoGrant } from 'livekit-server-sdk';

// ============================================================
// R2 / S3 egress output helper
// ============================================================

function makeS3Output(filepath: string): EncodedFileOutput {
  const R2_ACCESS_KEY = (process.env.R2_ACCESS_KEY ?? '').trim();
  const R2_SECRET_KEY = (process.env.R2_SECRET_KEY ?? '').trim();
  const R2_BUCKET = (process.env.R2_BUCKET ?? 'htg-rec').trim();
  const R2_ENDPOINT = (process.env.R2_ENDPOINT ?? '').trim();

  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    output: {
      case: 's3',
      value: new S3Upload({
        bucket: R2_BUCKET,
        region: 'auto',
        endpoint: R2_ENDPOINT,
        accessKey: R2_ACCESS_KEY,
        secret: R2_SECRET_KEY,
        forcePathStyle: true,
      }),
    },
  });
}

// ============================================================
// Environment — graceful fallbacks for missing keys
// ============================================================

// Trim all env vars — Vercel sometimes includes trailing newlines when pasted
const LIVEKIT_URL = (process.env.LIVEKIT_URL ?? '').trim();
const LIVEKIT_API_KEY = (process.env.LIVEKIT_API_KEY ?? '').trim();
const LIVEKIT_API_SECRET = (process.env.LIVEKIT_API_SECRET ?? '').trim();

function ensureConfig() {
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new Error(
      'LiveKit not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET env vars.',
    );
  }
}

// ============================================================
// Lazy singletons — created only when env vars are present
// ============================================================

// RoomServiceClient / EgressClient need https://, but LIVEKIT_URL is wss:// (for client SDK).
// Convert wss:// → https:// and strip trailing whitespace/newlines.
function getHttpHost(): string {
  return LIVEKIT_URL.trim()
    .replace(/^wss:\/\//, 'https://')
    .replace(/^ws:\/\//, 'http://');
}

let _roomService: RoomServiceClient | null = null;
function getRoomService(): RoomServiceClient {
  ensureConfig();
  if (!_roomService) {
    _roomService = new RoomServiceClient(getHttpHost(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  }
  return _roomService;
}

let _egressClient: EgressClient | null = null;
function getEgressClient(): EgressClient {
  ensureConfig();
  if (!_egressClient) {
    _egressClient = new EgressClient(getHttpHost(), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  }
  return _egressClient;
}

let _webhookReceiver: WebhookReceiver | null = null;
export function getWebhookReceiver(): WebhookReceiver {
  ensureConfig();
  if (!_webhookReceiver) {
    _webhookReceiver = new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
  }
  return _webhookReceiver;
}

// ============================================================
// Token generation
// ============================================================

export async function createLiveKitToken(
  identity: string,
  roomName: string,
  isStaff: boolean,
  displayName?: string,
): Promise<string> {
  ensureConfig();

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name: displayName ?? identity,
    ttl: '4h',
  });

  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: isStaff,
  };

  token.addGrant(grant);

  return token.toJwt();
}

// ============================================================
// Room management
// ============================================================

export async function createRoom(roomName: string) {
  const svc = getRoomService();
  return svc.createRoom({
    name: roomName,
    emptyTimeout: 300,      // 5 min empty before auto-close
    maxParticipants: 5,
  });
}

export async function listRoomParticipants(roomName: string) {
  const svc = getRoomService();
  return svc.listParticipants(roomName);
}

// ============================================================
// Egress — recording
// ============================================================

/**
 * Start a room-composite egress (MP4 recording of the entire room).
 * Returns the EgressInfo including the egress ID.
 */
export async function startRoomCompositeEgress(
  roomName: string,
  options?: { audioOnly?: boolean },
) {
  const client = getEgressClient();
  const output = makeS3Output(`recordings/${roomName}/{time}.mp4`);
  return client.startRoomCompositeEgress(roomName, { file: output }, {
    audioOnly: options?.audioOnly ?? false,
  });
}

/**
 * Start a participant egress — individual audio track per participant → R2.
 */
export async function startParticipantEgress(
  roomName: string,
  participantIdentity: string,
) {
  const client = getEgressClient();
  const output = makeS3Output(`recordings/${roomName}/tracks/${participantIdentity}-{time}.mp4`);
  return client.startParticipantEgress(roomName, participantIdentity, {
    file: output,
  });
}

/**
 * Stop a running egress by its ID.
 */
export async function stopEgress(egressId: string) {
  const client = getEgressClient();
  return client.stopEgress(egressId);
}

/**
 * List active egresses for a room.
 */
export async function listEgress(roomName: string) {
  const client = getEgressClient();
  return client.listEgress({ roomName, active: true });
}
