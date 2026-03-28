import { setRequestLocale } from 'next-intl/server';
import MeetingSimulatorClient from './MeetingSimulatorClient';

export default async function MeetingSimulatorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MeetingSimulatorClient />;
}
