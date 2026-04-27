export type MomentCategory =
  | "slowo"
  | "swiadectwo"
  | "nauczanie"
  | "pytania"
  | "inne";

export interface Moment {
  id: string;
  sessionId: string;
  title: string;
  category: MomentCategory;
  startSec: number;
  endSec: number;
  transcriptExcerpt: string | null;
  speakerName: string | null;
  publishedAt: string;
}
