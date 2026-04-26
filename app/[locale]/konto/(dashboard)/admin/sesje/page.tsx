import { redirect } from 'next/navigation';

export default async function OldSesjeRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/konto/admin/planer`);
}
