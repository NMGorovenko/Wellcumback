import { notFound } from 'next/navigation';
import RaceReview from '@/components/game/race/race-review';

export default function RaceReviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <RaceReview />;
}
