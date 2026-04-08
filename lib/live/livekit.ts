import {
  AccessToken,
  RoomServiceClient,
  EgressClient,
  WebhookReceiver,
  EncodedFileOutput,
  EncodedFileType,
  DirectFileOutput,
  S3Upload,
} from 'livekit-server-sdk';
import type { VideoGrant } from 'livekit-server-sdk';

// ============================================================
// R2 / S3 egress output helpers
// ============================================================

function makeR2S3Upload(): S3Upload {
  const R2_ACCESS_KEY = (process.env.R2_ACCESS_KEY ?? '').trim();
  const R2_SECRET_KEY = (process.env.R2_SECRET_KEY ?? '').trim();
  const R2_BUCKET = (process.env.R2_BUCKET ?? 'htg-rec').trim();
  const R2_ENDPOINT = (process.env.R2_ENDPOINT ?? '').trim();

  return new S3Upload({
    bucket: R2_BUCKET,
    region: 'auto',
    endpoint: R2_ENDPOINT,
    accessKey: R2_ACCESS_KEY,
    secret: R2_SECRET_KEY,
    forcePathStyle: true,
  });
}

function makeS3Output(filepath: string): EncodedFileOutput {
  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    output: {
      case: 's3',
      value: makeR2S3Upload(),
    },
  });
}

/**
 * DirectFileOutput for raw track egress — writes original track format
 * without re-encoding. For Opus audio tracks produces .ogg (Opus in Ogg container),
 * which Whisper API accepts natively as audio/ogg.
 */
function makeDirectR2Output(filepath: string): DirectFileOutput {
  return new DirectFileOutput({
    filepath,
    output: {
      case: 's3',
      value: makeR2S3Upload(),
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
    metadata: JSON.stringify({ isStaff }),
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

/** Observer token — hidden participant, subscribe-only. Admin/practitioner ghost peek. */
export async function createObserverToken(
  identity: string,
  roomName: string,
  displayName?: string,
): Promise<string> {
  ensureConfig();

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name: displayName ?? identity,
    metadata: JSON.stringify({ isObserver: true }),
    ttl: '2h',
  });

  const grant: VideoGrant = {
    room: roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: false,
    hidden: true,
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
 * Start a participant egress — records ALL published tracks of the participant
 * composited into one MP4 (video + audio). Used by legacy session_publications flow.
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
 * Start a track egress on a single audio track SID.
 * Writes the raw track (Opus in Ogg container) to R2 without re-encoding.
 * Used by the client-analysis pipeline — produces small audio-only files
 * (~5-10 MB per 10 min) that Whisper API processes directly.
 *
 * @param roomName - LiveKit room name
 * @param trackSid - Audio track SID (from ParticipantInfo.tracks[].sid)
 * @param participantIdentity - Used only for filename convention
 */
export async function startAudioTrackEgress(
  roomName: string,
  trackSid: string,
  participantIdentity: string,
) {
  const client = getEgressClient();
  const output = makeDirectR2Output(
    `recordings/${roomName}/analytics/${participantIdentity}-${trackSid}-{time}`
  );
  return client.startTrackEgress(roomName, output, trackSid);
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
