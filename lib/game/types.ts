export type StoryId = 'screen' | 'clean';
export type Result = {
  story: StoryId;
  score: number;
  seconds: number;
  players: number;
  date: string;
  details: string;
};
