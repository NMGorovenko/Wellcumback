import { notFound } from 'next/navigation';
import DriveReview from '@/components/game/city/drive-review';
export default function Page() {
  if (process.env.NODE_ENV !== 'development') notFound();
  return <DriveReview />;
}
