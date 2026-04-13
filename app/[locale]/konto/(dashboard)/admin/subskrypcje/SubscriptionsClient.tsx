'use client';

import { useRouter } from 'next/navigation';
import AddSubscriptionModal from '@/components/admin/AddSubscriptionModal';

export default function SubscriptionsClient({ userId, userEmail }: { userId: string; userEmail: string }) {
  const router = useRouter();
  return (
    <AddSubscriptionModal
      userId={userId}
      userEmail={userEmail}
      onAdded={() => router.refresh()}
    />
  );
}
