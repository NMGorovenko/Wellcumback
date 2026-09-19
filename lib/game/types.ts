export type StoryId = 'screen' | 'clean' | 'moving' | 'roma2';
export type Result = {
  /** Stable online run identity prevents a restored result from awarding twice. */
  runId?: string;
  story: StoryId;
  score: number;
  seconds: number;
  players: number;
  date: string;
  details: string;
};
