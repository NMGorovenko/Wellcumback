import { notFound } from 'next/navigation';
import CityReview from '@/components/game/city/city-review';
export default function CityReviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <CityReview />;
}
