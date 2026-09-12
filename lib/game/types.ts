export type StoryId = 'screen' | 'clean' | 'moving';
export type Result = {
  story: StoryId;
  score: number;
  seconds: number;
  players: number;
  date: string;
  details: string;
};
