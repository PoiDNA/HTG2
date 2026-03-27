import {
  AccessToken,
  RoomServiceClient,
  EgressClient,
  WebhookReceiver,
  EncodedFileOutput,
  EncodedFileType,
} from 'livekit-server-sdk';
import type { VideoGrant } from 'livekit-server-sdk';

// ============================================================
// Environment — graceful fallbacks for missing keys
// ============================================================

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? '';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';

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
    _roomService = new RoomServiceClient(getHttpHost(), LIVEKIT_API_KEY.trim(), LIVEKIT_API_SECRET.trim());
  }
  return _roomService;
}

let _egressClient: EgressClient | null = null;
function getEgressClient(): EgressClient {
  ensureConfig();
  if (!_egressClient) {
    _egressClient = new EgressClient(getHttpHost(), LIVEKIT_API_KEY.trim(), LIVEKIT_API_SECRET.trim());
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
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `recordings/${roomName}/{time}.mp4`,
  });
  return client.startRoomCompositeEgress(roomName, { file: output }, {
    audioOnly: options?.audioOnly ?? false,
  });
}

/**
 * Start a participant egress to capture individual participant audio as WAV.
 */
export async function startParticipantEgress(
  roomName: string,
  participantIdentity: string,
) {
  const client = getEgressClient();
  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: `recordings/${roomName}/tracks/${participantIdentity}-{time}.mp4`,
  });
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
